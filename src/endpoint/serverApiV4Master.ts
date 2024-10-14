/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { masterSetup, getServerIPV4Address, conet_Holesky_rpc} from '../util/util'
import {logger} from '../util/logger'
import devplopABI from './develop.ABI.json'
import {ethers} from 'ethers'
import { writeFile} from 'node:fs/promises'
import {cntpAdminWallet, initNewCONET, startEposhTransfer} from './utilNew'
import {mapLimit} from 'async'
import faucet_v3_ABI from './faucet_v3.abi.json'
import Ticket_ABI from './ticket.abi.json'
import CNTP_TicketManager_class  from '../util/CNTP_Transfer_pool_useTicketManager'

import rateABI from './conet-rate.json'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'


//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)

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
	logger(`Start Faucet Process Wainging List length = ${faucetWaitingPool.length}`)

	logger(inspect(faucetWaitingPool, false, 3, true))
	const ipAddress = faucetWaitingPool.map(n => n.ipAddress)
	const wallet = faucetWaitingPool.map(n => n.wallet)
	logger(inspect(wallet, false, 3, true))

	try {
		
		const tx = await faucet_v3_Contract.getFaucet(wallet, ipAddress)
		logger(`start Faucet Process tx = ${tx.hash} wallet ${faucetWallet.address}`)
		const timeout= setTimeout(() => {
			logger(`startFaucetProcess waiting tx conform TIMEOUT error! return Faucet array`)
			startFaucetProcessStatus = false
			return resolve(false)
		}, MAX_TX_Waiting)

		const tx_conform = await tx.wait()

		clearTimeout(timeout)

		if (!tx_conform) {
			logger(`startFaucetProcess ${tx.hash} failed tx.wait() return NULL!`)
			startFaucetProcessStatus = false
			return resolve(false)
		}

		logger(`startFaucetProcess `)
		logger(inspect(tx_conform, false, 3, true))
		faucetWaitingPool = []

	} catch (ex) {
		logger(`startFaucetProcess Error!`, ex)

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
		startFaucetProcess(),
		developWalletListening(eposh),
		moveData()
	])
}


const faucetV3_new_Addr = `0x04CD419cb93FD4f70059cAeEe34f175459Ae1b6a`
const ticketAddr = '0x92a033A02fA92169046B91232195D0E82b8017AB'

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[1], provideCONET)
const faucet_v3_Contract = new ethers.Contract(faucetV3_new_Addr, faucet_v3_ABI, faucetWallet)

const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provideCONET)
const profileWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[3], provideCONET)
export const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)


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
	

	let eposh = epochNodeData.get(body.epoch)
	if (!eposh) {
		eposh = new Map()
		epochNodeData.set(body.epoch, eposh)
	}

	eposh.set (body.ipaddress, {wallets: body.wallets, users: body.users})

	let epochTotal = epochTotalData.get (body.epoch)
	if (!epochTotal) {
		epochTotal = {
			totalConnectNode: 0,
			epoch: body.epoch,
			totalMiners: 0,
			totalUsers: 0
		}
	}

	epochTotal.totalMiners += body.wallets.length
	epochTotal.totalMiners += body.users.length
	epochTotal.totalConnectNode += 1

	logger(Colors.grey(`/miningData eposh ${body.epoch}  nodes ${body.ipaddress} = ${eposh.size}`))
	return res.status(200).end()
}


const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'.toLowerCase()
const filePath = '/home/peter/.data/v2/'


const moveData = async () => {
	const rateSC = new ethers.Contract(rateAddr, rateABI, provideCONET)
	const rate = parseFloat(ethers.formatEther(await rateSC.rate()))

	const block = currentEpoch - 1
	
	let _wallets: string[] = []
	let _users: string[] = []

	const epochTotal = epochTotalData.get (block)
	const epochAll =  epochNodeData.get (block)

	if (!epochTotal) {
		return logger (Colors.red(`moveData can't get epochTotal ${block}`))
	}

	if (!epochAll) {
		return logger (Colors.red(`moveData can't get epochAll ${block}`))
	}



	epochAll.forEach((v, keys) => {
		_wallets = [..._wallets, ...v.wallets]
		_users = [..._users, ...v.users]
	})
	
	const totalUsrs = _users.length
	const totalMiners = _wallets.length + totalUsrs
	const minerRate = (rate/totalMiners)/12

	
	logger(Colors.magenta(`${block} move data connecting = ${epochAll.size} total [${totalMiners}] miners [${_wallets.length}] users [${_users.length}] rate ${minerRate}`))
	const filename = `${filePath}${block}.wallet`
	const filename1 = `${filePath}${block}.total`
	const filename2 = `${filePath}${block}.users`

	
	await Promise.all ([
		writeFile(filename, JSON.stringify(_wallets)),
		writeFile(filename1, JSON.stringify({totalMiners, minerRate, totalUsrs})),
		writeFile(filename2, JSON.stringify(_users))
	])

	logger(Colors.blue(`moveData save files ${filename}, ${filename1}, ${filename2} success!`))
	
}


class conet_dl_server {

	private PORT = 8002
	private serverID = ''

	public CNTP_manager = new CNTP_TicketManager_class ([masterSetup.gameCNTPAdmin[0]], 1000)

	private initSetupData = async () => {
		this.serverID = getServerIPV4Address(false)[0]
		currentEpoch = await provideCONET.getBlockNumber()
		await getAllDevelopAddress()
		this.startServer()

		provideCONET.on ('block', async _block => {
			if (_block === currentEpoch + 1 ) {
				currentEpoch++
				return stratlivenessV2(_block, this)
			}
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

		app.all ('*', (req, res) => {
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

		router.post ('/initV3',  async (req, res) => {
			const wallet: string = req.body.wallet
			logger(Colors.blue(`/initV3 ${wallet}`))
			await initNewCONET(wallet)
			res.status(200).json({}).end()
			
		})

		router.post ('/miningData',  async (req, res) => {
			return miningData(req.body, res)
		})
		
		router.post ('/conet-faucet', async (req, res ) => {
			const wallet = req.body.walletAddress
			const ipaddress = req.body.ipaddress
			if (!wallet) {
				logger(Colors.red(`master conet-faucet req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}

			const tx = await faucet_call(wallet.toLowerCase(), ipaddress)
			if (tx) {
				return res.status(200).json(tx).end()
			}
			return res.status(403).end()
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