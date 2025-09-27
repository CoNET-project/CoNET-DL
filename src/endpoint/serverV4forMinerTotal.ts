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
import GuardianNodesV2ABI from '../util/GuardianNodesV2.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {readKey} from 'openpgp'
import {mapLimit, retry} from 'async'
import epoch_info_ABI from './epoch_info_managerABI.json'



const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'
import { log } from 'node:console'


//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

const provide_cancun = new ethers.JsonRpcProvider(conet_cancun_rpc)
const provide_mainnet = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')

export const checkGasPrice = 1550000


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}


process.on('unhandledRejection', (reason) => { throw reason; })

const MAX_TX_Waiting = 1000 * 60 * 3

const startFaucetProcess = () => new Promise(async resolve => {
	if (!faucetWaitingPool.length) {
		return resolve (false)
	}
	const sc = faucet_v3_Contract_Pool.shift()
	if (!sc) {
		return
	}

	logger(`faucetWaitingPool Start Faucet Process Wainging List length = ${faucetWaitingPool.length}`)

	logger(`faucetWaitingPool length = ${faucetWaitingPool.length}`)

	const splited = faucetWaitingPool.slice(0, 150)
	faucetWaitingPool = faucetWaitingPool.slice(150)

	const ipAddress = splited.map(n => n.ipAddress)
	const wallet = splited.map(n => n.wallet)

	try {
		
		const tx = await sc.getFaucet(wallet, ipAddress)
		await tx.wait()

		logger(`startFaucetProcess Success ${tx.hash}`)

	} catch (ex: any) {
		logger(`startFaucetProcess Error!`, ex.message)
	}
	faucet_v3_Contract_Pool.unshift(sc)
	return resolve(true)
})

const scAddr = '0x7859028f76f83B2d4d3af739367b5d5EEe4C7e33'.toLowerCase()

const sc = new ethers.Contract(scAddr, devplopABI, provide_cancun)

const developWalletPool: Map<string, boolean> = new Map()

const epoch_mining_info_cancun_addr = '0x31680dc539cb1835d7C1270527bD5D209DfBC547'
const epoch_mining_info_mainnet_addr = '0xbC713Fef0c7Bb178151cE45eFF1FD17d020a9ecD'

const epoch_mining_manager = new ethers.Wallet(masterSetup.epochManagre, provide_mainnet)

logger(`masterSetup.epochManagre = ${epoch_mining_manager.address}`)
const epoch_mining_sc = new ethers.Contract(epoch_mining_info_mainnet_addr, epoch_info_ABI, epoch_mining_manager)

const CONET_Guardian_cancun_addr = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'
const GuardianNodesInfoV6_cancun_addr = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'


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
	
	const blockTs = await provide_cancun.getBlock(block)

	if (!blockTs?.transactions) {
        return 
    }

	for (let tx of blockTs.transactions) {

		const event = await provide_cancun.getTransaction(tx)
		
		if ( event?.to?.toLowerCase() === scAddr) {
			await getAllDevelopAddress()
		}
		
	}
}

const stratlivenessV2 = async (eposh: number) => {
    logger(`stratlivenessV2 ${eposh}!`)
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

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[5], provide_cancun)
logger(Colors.magenta(`faucetWallet = ${faucetWallet.address}`))
const faucetContract = new ethers.Contract(faucetV3_cancun_Addr, faucet_v3_ABI, faucetWallet)
const faucet_v3_Contract_Pool = [faucetContract]


const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provide_cancun)
const profileWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[3], provide_cancun)
export const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)
const contract_Referral = new ethers.Contract(conet_Referral_cancun, CONET_Referral_ABI, provide_cancun)

interface faucetRequest {
	wallet: string
	ipAddress: string
}

export const checkGasPriceFordailyTaskPool = 25000000



let faucetWaitingPool: faucetRequest[] = []

let currentEpoch = 0

interface InodeEpochData {
	wallets: string[]
	users: string[]
    nodeWallet: string
}

const addTofaucetPool = async (wallet: string, ipAddress: string) => {
	const index = faucetWaitingPool.findIndex(n => n.wallet === wallet)
	if (index > -1) {
		return
	}

	try {
		const balance: BigInt = await provide_cancun.getBalance(wallet)
		if (!balance) {
			faucetWaitingPool.push({wallet, ipAddress})
			startFaucetProcess()
		}
	} catch (ex:any) {
		logger(Colors.red(`addTofaucetPool catch error, ${ex.message}`))
	}
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

	eposh.set (body.ipaddress, {wallets: [...body.wallets, body.nodeWallet], users: body.users, nodeWallet: body.nodeWallet})

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
    
	epochTotal.totalMiners += body.wallets.length + 1
	epochTotal.totalUsers += body.users.length
	epochTotal.totalConnectNode += 1

	logger(Colors.grey(`/miningData eposh ${body.epoch} nodes ${body.ipaddress} nodewallet ${body.nodeWallet} = ${eposh.size} [${body.wallets.length}:${ body.users.length}]`))
    logger('transfer',inspect(body?.transfer))
	addTofaucetPool(body.nodeWallet, body.ipaddress)
	return res.status(200).end()
}

const updateEpochToSC = async (epoch: iEPOCH_DATA) => {
	//	uint256 totalMiners, uint256 minerRate, uint256 totalUsrs, uint256 epoch
	try {

		const tx = await epoch_mining_sc.updateInfo(epoch.totalMiners, ethers.parseEther(epoch.minerRate.toFixed(10)), epoch.totalUsrs)
		await tx.wait()
		logger(Colors.blue(`updateEpochToSC current data to epoch info success! ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`updateEpochToSC store Cancun Error! ${ex.message}`))
	}
	
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
    nodeWallets: {ipAddr:string, wallet: string}[]
}

let EPOCH_DATA: iEPOCH_DATA


const moveData = async (epoch: number) => {
	const rateSC = new ethers.Contract(rateAddr, rateABI, provide_cancun)
	const rate = parseFloat(ethers.formatEther(await rateSC.miningRate()))

	const block = epoch-2
	
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

    const nodeWallets: {ipAddr:string, wallet: string}[] = []
	epochAll.forEach((v, keys) => {
        
		v.wallets.forEach(n => _wallets_.set(n.toLowerCase(), true))

        
        nodeWallets.push({ipAddr: keys, wallet: v.nodeWallet})
        v.users.forEach(n => {
			const k = n.toLowerCase()
			_users_.set(k, true)
			_wallets_.delete(k)
		})
	})

	

	
	const totalUsrs = _users_.size
	const totalMiners = _wallets_.size
	const minerRate = (rate/totalMiners)/12
	for (let w in [..._wallets_.keys()]) {
		// refferInit(w, '')
		// initCNTP(w)
	}
	for (let w in [..._users_.keys()]) {
		// refferInit(w, '')
		// initCNTP(w)
	}

	logger(Colors.magenta(`move data connecting [${block}]= ${epochAll.size} total [${totalMiners}] miners [${_wallets_.size}] users [${_users_.size}] rate ${minerRate}`))
	const filename = `${filePath}${block}.wallet`
	const filename1 = `${filePath}${block}.total`
	const filename2 = `${filePath}${block}.users`
	const filename3 = `${filePath}current.wallet`
	const filename4 = `${filePath}current.total`
	const filename5 = `${filePath}current.users`

	EPOCH_DATA = {totalMiners, minerRate, totalUsrs, epoch: block, nodeWallets}
	
	logger(inspect(EPOCH_DATA, false, 3, true))
	await Promise.all ([
		updateEpochToSC(EPOCH_DATA),
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

	private PORT = 8004
	private serverID = ''

	public CNTP_manager = new CNTP_TicketManager_class ([masterSetup.gameCNTPAdmin[0]], 1000)

	private initSetupData = async () => {
		this.serverID = getServerIPV4Address(false)[0]
		currentEpoch = await provide_mainnet.getBlockNumber()
		await getAllDevelopAddress()
		this.startServer()

		provide_mainnet.on ('block', async _block => {

			if (_block % 2) {
				return
			}

			currentEpoch = _block
			return stratlivenessV2(_block)
			
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

		app.use('/api', router )

		app.once('error', ( err: any ) => {
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

		router.post ('/epoch',(req: any, res: any) => {
			res.status(200).json(EPOCH_DATA).end()
		})

        router.post ('/allNodesWallets',(req: any, res: any) => {
			res.status(200).json(EPOCH_DATA).end()
		})


		router.post ('/miningData', (req: any, res: any) => {
			miningData(req.body, res)
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

new conet_dl_server()
