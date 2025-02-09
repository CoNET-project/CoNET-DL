/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { masterSetup, getServerIPV4Address, conet_cancun_rpc} from '../util/util'
import {logger} from '../util/logger'
import devplopABI from './develop.ABI.json'
import {ethers} from 'ethers'
import { writeFile} from 'node:fs/promises'
import {cntpAdminWallet, startEposhTransfer} from './utilNew'
import faucet_v3_ABI from './faucet_v3.abi.json'
import Ticket_ABI from './ticket.abi.json'
import CNTP_TicketManager_class  from '../util/CNTP_Transfer_pool'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import rateABI from './conet-rate.json'
import { refferInit, initCNTP, startProcess} from '../util/initCancunCNTP'
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'


//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

const provideCONET = new ethers.JsonRpcProvider(conet_cancun_rpc)

export const checkGasPrice = 1550000
let startDailyPoolTranferProcess = false
let lastTransferTimeStamp = new Date().getTime()
const longestWaitingTimeForDaily = 1000 * 60 * 10
const longestWaitingTimeForTicket = 1000 * 60 * 5


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}


process.on('unhandledRejection', (reason) => { throw reason; })


let startFaucetProcessStatus = false
const MAX_TX_Waiting = 1000 * 60 * 3

const startFaucetProcess = () => new Promise(async resolve => {
	if (!faucetWaitingPool.length || startFaucetProcessStatus) {
		return resolve (false)
	}

	startFaucetProcessStatus = true
	logger(`faucetWaitingPool Start Faucet Process Wainging List length = ${faucetWaitingPool.length}`)

	logger(`faucetWaitingPool length = ${faucetWaitingPool.length}`)

	const splited = faucetWaitingPool.slice(0, 150)
	faucetWaitingPool = faucetWaitingPool.slice(150)

	const ipAddress = splited.map(n => n.ipAddress)
	const wallet = splited.map(n => n.wallet)

	try {
		
		const tx = await faucet_v3_Contract.getFaucet(wallet, ipAddress)
		logger(`faucetWaitingPool start Faucet Process tx = ${tx.hash} wallet ${faucetWallet.address}`)

		const tx_conform = await tx.wait()

		if (!tx_conform) {
			logger(`startFaucetProcess ${tx.hash} failed tx.wait() return NULL!`)
		}

		logger(`startFaucetProcess Success ${tx_conform.hash}`)


	} catch (ex: any) {
		logger(`startFaucetProcess Error!`, ex.message)
	}
	
	startFaucetProcessStatus = false
	return resolve(true)
})

const scAddr = '0x7859028f76f83B2d4d3af739367b5d5EEe4C7e33'.toLowerCase()
const sc = new ethers.Contract(scAddr, devplopABI, provideCONET)
const developWalletPool: Map<string, boolean> = new Map()

const getAllDevelopAddress = async () => {
	let ret: any []
	try {
		ret = await sc.getAllDevelopWallets()
		
	} catch (ex: any) {
		return logger(Colors.red(`getAllDevelopAddress call error!`), ex.message)
	}

	for (let i = 0; i < ret.length; i ++){
		logger(Colors.blue(`getAllDevelopAddress added ${(ret[i][0])} to developWalletPool`))
		developWalletPool.set (ret[i][0].toLowerCase(), ret[i][1])
	}
}

const developWalletListening = async (block: number) => {
	
	const blockTs = await provideCONET.getBlock(block)

	if (!blockTs?.transactions) {
        return 
    }

	for (let tx of blockTs.transactions) {

		const event = await provideCONET.getTransaction(tx)
		
		if ( event?.to?.toLowerCase() === scAddr) {
			await getAllDevelopAddress()
		}
		
	}
}

const stratlivenessV2 = async (eposh: number, classData: conet_dl_server) => {
	logger
	await Promise.all([
		startProcess(),
		startFaucetProcess(),
		developWalletListening(eposh),
		moveData(eposh)
	])
}


const faucetV3_cancun_Addr = `0x8433Fcab26d4840777c9e23dC13aCC0652eE9F90`
const ticketAddr = '0x92a033A02fA92169046B91232195D0E82b8017AB'
const conet_Referral_cancun = '0xbd67716ab31fc9691482a839117004497761D0b9'

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[5], provideCONET)
const faucet_v3_Contract = new ethers.Contract(faucetV3_cancun_Addr, faucet_v3_ABI, faucetWallet)

const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provideCONET)
const profileWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[3], provideCONET)
export const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)
const contract_Referral = new ethers.Contract(conet_Referral_cancun, CONET_Referral_ABI, provideCONET)

interface faucetRequest {
	wallet: string
	ipAddress: string
}

export const checkGasPriceFordailyTaskPool = 25000000


let faucetWaitingPool: faucetRequest[] = []

export const faucet_call =  (wallet: string, ipAddress: string) => {
	try {
		let _wallet = ethers.getAddress(wallet).toLowerCase()
		const obj = faucet_call_pool.get(_wallet)
		if (obj) {
			return false
		}
		faucet_call_pool.set(wallet, true)
		faucetWaitingPool.push({wallet, ipAddress})
		
	} catch (ex) {
		return false
	}

	return true
}

let currentEpoch = 0

const faucet_call_pool: Map<string, boolean> = new Map()


interface InodeEpochData {
	wallets: string[]
	users: string[]
}


const epochNodeData: Map<number, Map<string,InodeEpochData >> = new Map()
const epochTotalData:  Map<number, IGossipStatus > = new Map()

const miningData = (body: any, res: Response) => {
	
	const ephchKey = parseInt(body.epoch)

	let eposh = epochNodeData.get(ephchKey)
	if (!eposh) {
		eposh = new Map()
		epochNodeData.set(ephchKey, eposh)
	}

	eposh.set (body.ipaddress, {wallets: body.wallets, users: body.users})

	let epochTotal = epochTotalData.get (ephchKey)
	if (!epochTotal) {
		epochTotal = {
			totalConnectNode: 0,
			epoch: ephchKey,
			totalMiners: 0,
			totalUsers: 0
		}
		epochTotalData.set(ephchKey, epochTotal)
	}
	epochTotal.totalMiners += body.wallets.length
	epochTotal.totalMiners += body.users.length
	epochTotal.totalConnectNode += 1

	//logger(Colors.grey(`/miningData eposh ${body.epoch}  nodes ${body.ipaddress} = ${eposh.size}`))
	return res.status(200).end()
}


const rateAddr = '0xE95b13888042fBeA32BDce7Ae2F402dFce11C1ba'.toLowerCase()
const filePath = '/home/peter/.data/v2/'

const ReferralsMap: Map<string, string> = new Map()
const initV3Map: Map<string, boolean> = new Map()

interface iEPOCH_DATA {
	totalMiners: number
	minerRate: number
	totalUsrs: number
	epoch: number
}
let EPOCH_DATA: iEPOCH_DATA

const moveData = async (epoch: number) => {
	const rateSC = new ethers.Contract(rateAddr, rateABI, provideCONET)
	const rate = parseFloat(ethers.formatEther(await rateSC.miningRate()))

	const block = epoch
	
	let _wallets_: Map<string, true> = new Map()
	let _users_: Map<string, true> = new Map()

	const epochTotal = epochTotalData.get (block)
	const epochAll =  epochNodeData.get (block)

	if (!epochTotal) {
		return logger (Colors.red(`moveData can't get epochTotal ${block}`))
	}

	if (!epochAll) {
		return logger (Colors.red(`moveData can't get epochAll ${block}`))
	}



	epochAll.forEach((v, keys) => {
		v.wallets.forEach(n => _wallets_.set(n.toLowerCase(), true))
	})

	epochAll.forEach((v, keys) => {
		v.users.forEach(n => {
			const k = n.toLowerCase()
			_users_.set(k, true)
			_wallets_.delete(k)
		})
	})
	
	

	
	const totalUsrs = _users_.size
	const totalMiners = _wallets_.size + totalUsrs
	const minerRate = (rate/totalMiners)/12
	for (let w in [..._wallets_.keys()]) {
		// refferInit(w, '')
		// initCNTP(w)
	}
	for (let w in [..._users_.keys()]) {
		// refferInit(w, '')
		// initCNTP(w)
	}

	logger(Colors.magenta(`${block} move data connecting = ${epochAll.size} total [${totalMiners}] miners [${_wallets_.size}] users [${_users_.size}] rate ${minerRate}`))
	const filename = `${filePath}${block}.wallet`
	const filename1 = `${filePath}${block}.total`
	const filename2 = `${filePath}${block}.users`
	const filename3 = `${filePath}current.wallet`
	const filename4 = `${filePath}current.total`
	const filename5 = `${filePath}current.users`

	EPOCH_DATA = {totalMiners, minerRate, totalUsrs, epoch: block}
	logger(inspect(EPOCH_DATA, false, 3, true))
	await Promise.all ([
		writeFile(filename, JSON.stringify([..._wallets_.keys()]), 'utf8'),
		writeFile(filename1, JSON.stringify(EPOCH_DATA), 'utf8'),
		writeFile(filename2, JSON.stringify([..._users_.keys()]), 'utf8'),
		writeFile(filename3, JSON.stringify([..._wallets_.keys()]), 'utf8'),
		writeFile(filename4, JSON.stringify(EPOCH_DATA), 'utf8'),
		writeFile(filename5, JSON.stringify([..._users_.keys()]), 'utf8')
	])

	logger(Colors.blue(`moveData save files ${filename}, ${filename1}, ${filename2} success!`))
	
}


class conet_dl_server {

	private PORT = 8003
	private serverID = ''

	public CNTP_manager = new CNTP_TicketManager_class ([masterSetup.gameCNTPAdmin[0]], 1000)

	private initSetupData = async () => {
		this.serverID = getServerIPV4Address(false)[0]
		currentEpoch = await provideCONET.getBlockNumber()
		await getAllDevelopAddress()
		this.startServer()

		provideCONET.on ('block', async _block => {

			if (_block % 2) {
				return
			}
			currentEpoch ++
			return stratlivenessV2(_block, this)
			
		})
		
	}

	constructor () {
		this.initSetupData ()
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

		app.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.red(`Cluster Master get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		logger(`start master server!`)

		server.listen(this.PORT, '127.0.0.1', () => {
			startEposhTransfer()
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {

		router.post ('/miningData', (req: any, res: any) => {
			miningData(req.body, res)
		})

		router.post ('/epoch',(req: any, res: any) => {
			
			res.status(200).json(EPOCH_DATA).end()
		})



		router.post('/initV3',async (req: any, res: any) =>{
			
			let wallet: string
			try {
				wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`request /wallet req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}

			wallet = wallet.toLowerCase()
			let address = ReferralsMap.get (wallet)
			if (!address) {
				return res.status(200).json({err: 'no wallet'}).end()
			}
			const initWallet = initV3Map.get (address)
			if (initWallet) {
				return res.status(200).json({address}).end()
			}

			initV3Map.set(address, true)

			
			refferInit(wallet, '')
			initCNTP(wallet)
			return res.status(200).json({address}).end()

		})

		router.post ('/wallet',  async (req: any, res: any) =>{
			
			let wallet: string
			try {
				wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`request /wallet req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			
			wallet = wallet.toLowerCase()
			let address = ReferralsMap.get (wallet)
			if (address) {
				return res.status(200).json({address}).end()
			}

			try {
				
				address = await contract_Referral.getReferrer(wallet)
			} catch (ex){
				logger(Colors.red(`contract.getReferrer Error!`))
				return res.status(200).json({}).end()
			}

			if (!address) {
				address = '0x0000000000000000000000000000000000000000'
			}

			address = address.toLowerCase()

			

			ReferralsMap.set(wallet, address)

			//logger(Colors.grey(`address = [${address}] ReferralsMap Total Length = [${ReferralsMap.size}]`))
			return res.status(200).json({address}).end()
		})
		
		router.post ('/conet-faucet', async (req: any, res: any) => {
			const wallet = req.body.walletAddress
			const ipaddress = req.body.ipaddress
			if (!wallet) {
				logger(Colors.red(`master conet-faucet req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}
			const initWallet = initV3Map.get (wallet)

			if (!initWallet) {

				initV3Map.set(wallet, true)
				refferInit(wallet, '')
				initCNTP(wallet)
			}

			
			const tx = await faucet_call(wallet.toLowerCase(), ipaddress)
			
			if (tx) {
				return res.status(200).json(tx).end()
			}
			return res.status(403).end()
		})


		router.post ('/fx168HappyNewYear', async (req: any, res: any) => {
			const wallet = req.body.walletAddress
			if (!wallet) {
				logger(Colors.red(`master fx168HappyNewYear req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}
		})
		

		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server