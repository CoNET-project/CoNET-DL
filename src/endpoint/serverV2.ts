/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import {regiestFaucet, getOraclePrice, txManager, claimeToekn} from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import {v4} from 'uuid'
import Cluster from 'node:cluster'
import { logger, checkErc20Tx, checkValueOfGuardianPlan, checkTx, getAssetERC20Address, checkReferralsV2_OnCONET_Holesky, newCNTP_Contract,
	returnGuardianPlanReferral, CONET_guardian_Address,checkSignObj, getNetworkName, getServerIPV4Address, conet_Holesky_rpc
} from '../util/util'

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

const conet_Holesky_RPC = 'https://rpc2.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)

//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {

	
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]||req.headers['X-Forwarded-For'.toLowerCase()]||req.headers['CF-Connecting-IP'.toLowerCase()]||req.ip
	if (!ipaddress) {
		return ''
	}
	if (typeof ipaddress === 'object') {
		return ipaddress[0]
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
const CGPNsAddr = '0x5e4aE81285b86f35e3370B3EF72df1363DD05286'

const guardianNodesList: string[] = []


 
const unlockCNTP = async (wallet: string, privateKey: string) => {
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const walletObj = new ethers.Wallet(privateKey, provider)
	const cCNTPContract = new ethers.Contract(newCNTP_Contract, CNTPAbi, walletObj)
	let tx
	try {
		tx = await cCNTPContract.changeAddressInWhitelist(wallet, true)
	} catch (ex: any) {
		logger(Colors.red(`unlockCNTP error! Try again`), ex.message)
		return setTimeout(() => {
			unlockCNTP(wallet, privateKey)
		}, Math.round( 10 * Math.random()) * 1000)
	}
	logger(Colors.gray(`unlockCNTP [${wallet}] success! tx = ${tx.hash}`) )
}

const postLocalhost = async (path: string, obj: any, _res: Response)=> {
	
	const option: RequestOptions = {
		hostname: 'localhost',
		path,
		port: 8001,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		res.pipe(_res)
	})

	req.once('error', (e) => {
		console.error(`postLocalhost to master on Error! ${e.message}`,)
		if (_res.writable && !_res.writableEnded) {
			_res.status(502).end()
		}
		_res.socket?.destroy()
	})

	req.write(JSON.stringify(obj))
	req.end()
}

class conet_dl_server {

	private PORT = 80
	private appsPath = ''
	private serverID = ''

	private si_pool: nodeType[] = []
	private masterBalance: CNTPMasterBalance|null = null

	private initSetupData = async () => {


        logger (Colors.blue(`start local server!`))
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		this.startServer()

	}

	constructor () {
		this.initSetupData ()
    }

	private startServer = async () => {
		const staticFolder = join ( this.appsPath, 'static' )
		const launcherFolder = join ( this.appsPath, 'launcher' )
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use ( Express.static ( staticFolder ))
        app.use ( Express.static ( launcherFolder ))
		app.use (async (req, res, next) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			const head = req.headers['host']
			
			if (!head || !/apiv2\.conet\.network/i.test(head)) {
				res.status(404).end()
				return res.socket?.end().destroy()
			}
			
			if (/^post$/i.test(req.method)) {
				
				return Express.json({limit: '1mb'})(req, res, err => {
					if (err) {
						res.sendStatus(400).end()
						res.socket?.end().destroy()
						logger(Colors.red(`/^post$/i.test Attack black ${ipaddress} ! ${req.url}`))
						logger(inspect(req.body, false, 3, true))
						return 
					}
					return next()
				})
			}
				
			return next()
			
		})

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
			logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, '0.0.0.0', () => {
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {
		

		router.get ('/health', async (req,res) => {
			if (res.writable && !res.writableEnded) {
				res.json ({ health: true }).end()
			}
			return res.socket?.end().destroy()

		})

		//********************			V2    		****** */				
		router.post ('/conet-faucet', async (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// logger (Colors.grey(`Router /conet-faucet to [${ ipaddress }]`))
			let wallet_add = req.body?.walletAddr

			if (! wallet_add ||! ipaddress) {
				logger (`POST /conet-faucet ERROR! Have no walletAddr [${ipaddress}]`, inspect(req.body, false, 3, true))
				if (res.writable && !res.writableEnded) {
					res.status(400).end()
				}
				return res.socket?.end().destroy()
			}
			
			try {
				wallet_add = ethers.getAddress(wallet_add)
			} catch (ex) {
				logger(Colors.grey(`ethers.getAddress(${wallet_add}) Error!`))
				if (res.writable && !res.writableEnded) {
					return res.status(400).end()
				}
				
				return res.socket?.end().destroy()
			}
			
			const balance = await provider.getBalance(wallet_add) - BigInt(10000000000000)
			if (balance > 0) {
				return res.status(403).end()
			}
			
			return regiestFaucet(wallet_add, ipaddress).then (async n => {
				if (!n) {
					if (res.writable && !res.writableEnded) {
						res.status(400).end()
					}
					return res.socket?.end().destroy()
				}
				// transCONET(wallet_add, ethers.parseEther(faucetRate))

				return postLocalhost('/api/conet-faucet', {walletAddress: wallet_add}, res)

			})


		})

		router.get ('/conet-nodes', async ( req, res ) => {
			res.json({node:this.si_pool, masterBalance: this.masterBalance}).end()
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

		router.get ('/asset-prices', async ( req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			
			let kk
			try {
				kk = await getOraclePrice()
			} catch (ex) {
				logger(Colors.gray(`/asset-prices from ${ipaddress} Error!` ), ex)
				return res.status(403).json({}).end()
			}
			logger(Colors.gray(`/asset-prices from ${ipaddress} success!` ), inspect(kk, false, 3, true))
			return res.status(200).json(kk).end()
		})

		router.post ('/Purchase-Guardian', async (req,res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// const ipaddress = req.headers['cf-connecting-ip']||splitIpAddr(req.ip)
			
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /Purchase-Guardian message = req.body.message ERROR!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
				
			}
			
			if (!message||!signMessage) {
				logger (Colors.grey(`Router /Purchase-Guardian !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return  res.status(403).end()
				
			}
			
			const obj = checkSignObj (message, signMessage)

			if (!obj||!obj?.data) {
				logger (Colors.grey(`Router /Purchase-Guardian checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			logger(Colors.magenta(`/Purchase-Guardian from ${ipaddress}`))
			logger(inspect(obj, false, 3, true))

			if (obj.data?.nodes !== obj.data?.publishKeys?.length) {
				logger(Colors.grey(`Router /Purchase-Guardian obj.data?.nodes !== obj.data?.publishKeys?.length Error!`), inspect(obj, false, 3, true))
				return res.status(403).end()
			}

			const txObj = await checkTx (obj.data.receiptTx, obj.data.tokenName)

			if (typeof txObj === 'boolean'|| !txObj?.tx1 || !txObj?.tx) {
				logger(Colors.grey(`Router /Purchase-Guardian txObj Error!`), inspect(txObj, false, 3, true))
				return res.status(403).end()
			}

			if (txObj.tx1.from.toLowerCase()!== obj.walletAddress) {
				logger(Colors.red(`Router /Purchase-Guardian txObj txObj.tx1.from [${txObj.tx1.from}] !== obj.walletAddress [${obj.walletAddress}]`))
				return res.status(403).end()
			}

			const networkName = getNetworkName(obj.data.tokenName)
			if (!networkName) {
				logger(Colors.red(`Router /Purchase-Guardian Can't get network Name from token name Error ${obj.data.tokenName}`))
				return res.status(403).end()
			}

			const CONET_receiveWallet = CONET_guardian_Address(obj.data.tokenName)
			
			const _checkTx = await txManager (obj.data.receiptTx, obj.data.tokenName, obj.walletAddress, obj.data.nodes, networkName, message, signMessage )

			if (!_checkTx) {
				logger(Colors.red(`Router /Purchase-Guardian tx [${obj.data.receiptTx}] laready used`))
				return res.status(403).end()
			}

			logger(Colors.blue(`${message}`))
			logger(Colors.blue(`${signMessage}`))
			
			if (txObj.tx1.to?.toLowerCase() !== CONET_receiveWallet) {
				if (getAssetERC20Address(obj.data.tokenName) !== txObj.tx1.to?.toLowerCase()) {
					logger(Colors.red(`Router /Purchase-Guardian ERC20 token address Error!`), inspect( txObj.tx1, false, 3, true))
					return res.status(403).end()
				}
				const erc20Result = checkErc20Tx(txObj.tx, CONET_receiveWallet, obj.walletAddress, obj.data.amount, obj.data.nodes, obj.data.tokenName)
				if (erc20Result === false) {
					logger(Colors.red(`Router /Purchase-Guardian  checkErc20Tx Error!`))
					return res.status(403).end()
				}
				const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
				if (!kk) {
					logger(Colors.red(`Router /Purchase-Guardian  checkValueOfGuardianPlan Error!`))
					return res.status(403).end()
				}
				const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
				const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, masterSetup.conetFaucetAdmin[0], obj.data.publishKeys)
				return res.status(200).json(ret).end()
			}
			
			
			const value = txObj.tx1.value.toString()
			if (obj.data.amount !== value) {
				logger(Colors.red(`GuardianPlanPreCheck amount[${obj.data.amount}] !== tx.value [${value}] Error!`))
				return res.status(403).end()
			}




			const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
			if (!kk) {
				logger(Colors.red(`checkValueOfGuardianPlan checkValueOfGuardianPlan has unknow tokenName [${obj.data.tokenName}] Error! ${inspect(txObj, false, 3, true)}`))
				return res.status(403).end()
			}

			logger(Colors.red(`checkValueOfGuardianPlan non USDT obj.data.tokenName [${obj.data.tokenName}] Error! kk ${kk} ${value} ${inspect(txObj, false, 3, true)}`))
			return res.status(403).end()
			
			// const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
			// const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, obj.data.amount, masterSetup.claimableAdmin, obj.data.publishKeys)
			// return res.status(200).json(ret).end()
		})

		router.post ('/leaderboardData',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			let wallet: string
			try {
				wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /leaderboardData req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			if (!leaderboardData.epoch||!free_referrals_rate_lists||!guardians_referrals_rate_lists) {

				return res.status(502).json({}).end()
			}

			const ret = {
				leaderboardData,
				free_referrals_rate: wallet ? free_referrals_rate_lists?.filter ? free_referrals_rate_lists.filter(n => n.wallet.toLowerCase() === wallet.toLowerCase())[0]: '': '',
				guardians_referrals_rate: wallet ? guardians_referrals_rate_lists?.filter ? guardians_referrals_rate_lists.filter(n => n.wallet.toLowerCase() === wallet.toLowerCase())[0]: '': '',
				totalMiner, minerRate
			}
			//logger(Colors.grey(` ${ipaddress} GET /leaderboardData wallet [${wallet}] free_referrals_rate = [${ret.free_referrals_rate}] guardians_referrals_rate = [${ret.guardians_referrals_rate}]`))

			return res.status(200).json(ret).end()
		})

		router.post ('/lottery', async ( req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				return res.status(404).end()
			}
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /Purchase-Guardian !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router /lottery checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}
			obj.ipAddress = ipaddress
			return postLocalhost('/api/lottery', {obj}, res)
		})

		router.post ('/checkAccount',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /checkAccount req.body ERROR!`), inspect(req.body))
				return res.status(403).end()
			}
			

			const obj = checkSignObj (message, signMessage)
			if (!obj) {
				logger (Colors.grey(`Router /checkAccount !obj or this.saPass Error! ${ipaddress}`), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}

			const address = obj?.walletAddress1||[]
			if (!obj.walletAddress || !address ) {
				logger (Colors.grey(`Router /checkAccount !obj or this.saPass Error! ${ipaddress} `), inspect(req.body, false, 3, true))
				return res.status(403).end()
			}
			
			
			return res.status(403).json({ublock: true}).end()
		})


		router.post ('/initV3',  async (req, res) => {
			const _wallet: string = req.body.walletAddress
			let wallet: string 
			try {
				wallet = ethers.getAddress(_wallet)
			} catch (ex) {
				return res.status(403).end()
			}

			return postLocalhost('/api/initV3', {wallet: wallet.toLowerCase()}, res)
			
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
