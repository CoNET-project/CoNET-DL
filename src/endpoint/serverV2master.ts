/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import {regiestFaucet, getLast5Price, getOraclePrice, txManager, claimeToekn} from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import {v4} from 'uuid'
import Cluster from 'node:cluster'
import { logger, checkErc20Tx, checkValueOfGuardianPlan, checkTx, getAssetERC20Address, checkReferralsV2_OnCONET_Holesky, cCNTP_Contract, getWasabiFile,
	returnGuardianPlanReferral, CONET_guardian_Address,checkSignObj, getNetworkName, getCNTPMastersBalance, getServerIPV4Address, s3fsPasswd, storageWalletProfile, conet_Holesky_rpc, sendCONET
} from '../util/util'
import CGPNsABI from '../util/CGPNs.json'
import CNTPAbi from '../util/cCNTP.json'
import {ethers} from 'ethers'
import type { RequestOptions, get } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet} from './util'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
let s3Pass: s3pass
//	for production
	import {createServer} from 'node:http'

//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const FaucetCount = '0.01'

let leaderboardData = {
	epoch: '',
	free_cntp: null,
	free_referrals: null,
	guardians_cntp: null, 
	guardians_referrals: null
}

interface rate_list {
	wallet: string
	cntpRate: string
	referrals: string
}
let free_referrals_rate_lists: rate_list[] = []

let guardians_referrals_rate_lists: rate_list[] = []

let minerRate = ''
let totalMiner = ''


const faucetRate = BigInt('10000000000000000')

const selectLeaderboard: (block: number) => Promise<boolean> = (block) => new Promise(async resolve => {
	const [_node, _free] = await Promise.all([
		getWasabiFile(`${block}_node`),
		getWasabiFile(`${block}_free`)
	])
	if (!_node||!_free) {
		//logger(Colors.blue(`selectLeaderboard can't find block [${block}] data Error!! try again`))
		return resolve(await selectLeaderboard(block-1))
	}
	let node, free
	try {
		node = JSON.parse(_node)
		free = JSON.parse(_free)
	} catch (ex) {
		logger(Colors.blue(`selectLeaderboard JSON.parse [${ block }] data Error!`))
		return resolve(false)
	}
	logger(Colors.blue(`selectLeaderboard got [${block}] data!`))
	leaderboardData.epoch = block.toString()
	leaderboardData.free_cntp = free.cntp
	leaderboardData.free_referrals = free.referrals
	leaderboardData.guardians_cntp = node.cntp
	leaderboardData.guardians_referrals = node.referrals
	free_referrals_rate_lists = free.referrals_rate_list
	guardians_referrals_rate_lists = node.referrals_rate_list
	minerRate = free.minerRate
	totalMiner = free.totalMiner
	return (true)
})


const startListeningCONET_Holesky_EPOCH = async () => {
	
	
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const block = await provideCONET.getBlockNumber()
	getAllOwnershipOfGuardianNodes(provideCONET)

	provideCONET.on('block', async block => {
		await selectLeaderboard(block)
	})

	await selectLeaderboard(block)

}


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

const addAttackToCluster = async (ipaddress: string) => {
	const option: RequestOptions = {
		hostname: 'apiv2.conet.network',
		path: `/api/ipaddress`,
		port: 4100,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		ipaddress: ipaddress
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {
			logger(Colors.blue(`addAttackToCluster [${ipaddress}] success! data = [${data}]`))
		})
	})

	req.once('error', (e) => {
		logger(Colors.red(`addAttackToCluster r[${ipaddress}] equest on Error! ${e.message}`))
	})

	req.write(JSON.stringify(postData))
	req.end()
}
const CGPNsAddr = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const guardianNodesList: string[] = []
 
const _unlockCNTP = async (wallet: string, privateKey: string, CallBack: (err?: any, data?: ethers.TransactionResponse) => void) => {
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const walletObj = new ethers.Wallet(privateKey, provider)
	const cCNTPContract = new ethers.Contract(cCNTP_Contract, CNTPAbi, walletObj)
	let tx
	try {
		tx = await cCNTPContract.changeAddressInWhitelist(wallet, true)
	} catch (ex: any) {
		logger(Colors.red(`unlockCNTP error! ${ex.message}`))
		return CallBack (ex.message)
	}

	logger(Colors.gray(`unlockCNTP [${wallet}] success! tx = ${tx.hash}`) )
	return CallBack (null, tx)
}

const getAllOwnershipOfGuardianNodes = async (provideCONET: ethers.JsonRpcProvider) => {
	const guardianSmartContract = new ethers.Contract(CGPNsAddr, CGPNsABI,provideCONET)
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return logger(Colors.grey(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error! STOP `), ex.mesage)
	}
	const _nodesAddress: string[] = nodes[0].map((n: string) => n.toLowerCase())

	const NFTIds = _nodesAddress.map ((n, index) => 100 + index)

	let NFTAssets: number[]

	try {
		NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)
	} catch (ex: any) {
		return logger(Colors.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	}


	NFTAssets.forEach((n, index) => {
		if (n ) {
			guardianNodesList.push(_nodesAddress[index])
		}
	})
	logger(Colors.blue(`guardianNodesList length = [${guardianNodesList.length}]`))
}


interface conetData {
	address: string
	balance?: BigInt
	req: any
}

const etherNew_Init_Admin = new ethers.Wallet (masterSetup.conetFaucetAdmin[0], new ethers.JsonRpcProvider(conet_Holesky_rpc))
const sentData = async (data: conetData, callback: (err?: any, data?: ethers.TransactionResponse) => void) => {

	let tx
	try{
		const addr = ethers.getAddress(data.address)
		const ts = {
			to: addr,
			// Convert currency unit from ether to wei
			value: data.balance?.toString()
		}
		tx = await etherNew_Init_Admin.sendTransaction(ts)
	} catch (ex) {
		console.log(Colors.red(`${data.balance} CONET => [${data.address}] Error!`))
		return callback(ex)
	}
	return callback (null, tx)
}

const transCONETArray: conetData[] = []
let transCONETLock = false
let unlockCONETLock = false
const unlockArray: conetData[] = []

const unlockCNTP = (address: string, req: Response) => {
	logger(Colors.blue(`unlockCNTP [${address}]`))
	unlockArray.push ({
		address, req
	})
	
	const unlock: any = async () => {
		if (unlockCONETLock) {
			return
		}
		const data = unlockArray.shift()
		if (!data) {
			unlockCONETLock = false
			return
		}
		unlockCONETLock = true
		return _unlockCNTP(data.address, masterSetup.claimableAdmin, (err, tx) => {
			unlockCONETLock = false
			if (err) {
				unlockArray.unshift(data)
				return unlock ()
			}
			req.json({tx}).end()
			return unlock ()
		})
	}

	if (unlockArray.length) {
		unlock()
	}
	
}

const transCONET = (address: string, balance: BigInt, req: Response) => {
	transCONETArray.push ({
		address, balance, req
	})
	
	const trySent: any = async () => {
		if (transCONETLock) {
			return
		}
		transCONETLock = true
		const data = transCONETArray.shift()

		if (!data) {
			transCONETLock = false
			return
		}
		

		return sentData(data, (err, tx) => {
			transCONETLock = false
			if (err) {
				transCONETArray.unshift(data)
				return trySent ()
			}
			req.json({tx}).end()
			return trySent ()
		})
	}

	if (transCONETArray.length) {
		trySent()
	}
	
}

class conet_dl_server {

	private PORT = 8001
	private appsPath = ''
	private serverID = ''

	private si_pool: nodeType[] = []
	private masterBalance: CNTPMasterBalance|null = null
	private s3Pass: s3pass|null = null

	private initSetupData = async () => {


        logger (Colors.blue(`start local server!`))
		this.masterBalance = await getCNTPMastersBalance(masterSetup.conetFaucetAdmin[0])
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		this.s3Pass = await s3fsPasswd()
		this.startServer()
		

	}

	constructor () {
		this.initSetupData ()
		startListeningCONET_Holesky_EPOCH()
    }

	private startServer = async () => {
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use(Cors ())
		app.use(Express.json())

		app.use( '/api', router )

		app.once ( 'error', ( err: any ) => {
			/**
			 * https://stackoverflow.com/questions/60372618/nodejs-listen-eacces-permission-denied-0-0-0-080
			 * > sudo apt-get install libcap2-bin 
			 * > sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
			 * 
			 */
            logger (err)
            logger (Colors.red(`Local server on ERROR`))
        })

		const server = createServer(app)

		this.router (router)

		app.all ('*', (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, '127.0.0.1', () => {
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {


		//********************			V2    		****** */				
		router.post ('/conet-faucet', (req, res ) => {
			
			const wallet = req.body.walletAddress

			if (!wallet) {
				logger(Colors.red(`master conet-faucet req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}

			return transCONET (wallet, faucetRate, res)

		})


		router.post ('/claimToken', async ( req, res ) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			
			const response = await claimeToekn (message, signMessage)
			if (response) {
				return res.status(200).json({}).end()
			}
			return res.status(403).end()

		})

		router.post ('/Purchase-Guardian', async (req,res) => {
			logger(Colors.red(`Router /Purchase-Guardian  checkValueOfGuardianPlan Error!`))
			return res.status(403).end()
			
			// if (txObj.tx1.to?.toLowerCase() !== CONET_receiveWallet) {
			// 	if (getAssetERC20Address(obj.data.tokenName) !== txObj.tx1.to?.toLowerCase()) {
			// 		logger(Colors.red(`Router /Purchase-Guardian ERC20 token address Error!`), inspect( txObj.tx1, false, 3, true))
			// 		return res.status(403).end()
			// 	}
			// 	const erc20Result = checkErc20Tx(txObj.tx, CONET_receiveWallet, obj.walletAddress, obj.data.amount, obj.data.nodes, obj.data.tokenName)
			// 	if (erc20Result === false) {
			// 		logger(Colors.red(`Router /Purchase-Guardian  checkErc20Tx Error!`))
			// 		return res.status(403).end()
			// 	}
			// 	const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
			// 	if (!kk) {
			// 		logger(Colors.red(`Router /Purchase-Guardian  checkValueOfGuardianPlan Error!`))
			// 		return res.status(403).end()
			// 	}
			// 	const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
			// 	const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, obj.data.amount, masterSetup.conetFaucetAdmin[0], obj.data.publishKeys)
			// 	return res.status(200).json(ret).end()
			// }
			
			// const value = txObj.tx1.value.toString()
			// if (obj.data.amount !== value) {
			// 	logger(Colors.red(`GuardianPlanPreCheck amount[${obj.data.amount}] !== tx.value [${value}] Error!`))
			// 	return res.status(403).end()
			// }

			// const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
			// if (!kk) {
			// 	logger(Colors.red(`checkValueOfGuardianPlan Error!`))
			// 	return res.status(403).end()
			// }
			
			// const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
			// const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, obj.data.amount, masterSetup.claimableAdmin, obj.data.publishKeys)
			// return res.status(200).json(ret).end()
		})


		router.post ('/unlockCONET',  async (req, res) => {
			
			const wallet = req.body.walletAddress
			logger(Colors.blue(`unlockCNTP eq.body.walletAddress [${wallet}]`))
			if (!wallet) {
				logger(Colors.red(`master conet-faucet req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}

			const index = guardianNodesList.findIndex(n => n === wallet )
			if (index < 0) {
				return unlockCNTP(wallet, res)
			}

			return res.status(403).json({unlock: true}).end()
		})


		router.all ('*', (req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server