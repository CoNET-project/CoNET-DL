/**
 * 			
 * */
import Express, { Router } from 'express'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import {ethers} from 'ethers'
import {transferPool, startTransfer} from '../util/transferManager'
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
import {createServer} from 'node:http'
import {getAllMinerNodes, getIpAddressFromForwardHeader} from './help-database'
import { masterSetup, storageIPFS} from '../util/util'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import {logger} from '../util/logger'
import { writeFile} from 'node:fs'
import {v4} from 'uuid'
import {homedir} from 'node:os'
import { join } from 'node:path'
import epochRateABI from '../util/epochRate.json'
import rateABI from './conet-rate.json'

const ReferralsMap: Map<string, string> = new Map()
const conet_Holesky_RPC = 'https://rpc1.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)

const ReferralsV2Addr = '0x64Cab6D2217c665730e330a78be85a070e4706E7'.toLowerCase()
const epochRateAddr = '0x9991cAA0a515F22386Ab53A5f471eeeD4eeFcbD0'
const rateAddr = '0xFAF1f08b66CAA3fc1561f30b496890023ea70648'.toLowerCase()
const conet_Referral_contractV3 = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'


interface epochRate {
	totalNodes:string
	epoch: string
	totalMiner: string
}

process.on('uncaughtException', err=> {
	logger(`Catch uncaughtException`, err)
})

const epochRate: epochRate[]= []


const storeToChain = async (data: epochRate) => {
	logger(inspect(data, false, 3, true))
	const wallet = new ethers.Wallet(masterSetup.GuardianReferralsFree, provider)
	const cCNTPContract = new ethers.Contract(epochRateAddr, epochRateABI, wallet)
	let tx
	try {
		tx = await cCNTPContract.updateEpoch(data.totalMiner, data.totalNodes, data.epoch)
	} catch (ex: any) {
		logger(Colors.red(`storeToChain Error!`), ex.message)
		
		return
	}
	return logger(Colors.green(`storeToChain ${inspect(data, false, 3, true)} success! tx = [${tx.hash}]`))
}


let EPOCH=0
let s3Pass: s3pass|null = null
const tokensEachEPOCH = 0.003472 			//		34.72
let minerRate = BigInt(0)


const rateSC = new ethers.Contract(rateAddr, rateABI, provider)

const transferMiners = async (EPOCH: number, WalletIpaddress: Map<string, string>, ipaddressWallet: Map<string, string>) => {
	
	const totalFreeMiner = BigInt (WalletIpaddress.size)
	const rate = await rateSC.rate()
	
	if (!rate || !totalFreeMiner) {
		return console.log(Colors.magenta(`transferMiners EPOCH [${EPOCH}] rate is zero [${ethers.formatEther(rate)}] or totalFreeMiner [${totalFreeMiner}] is zero STOP transferMiners`))
	}

	const _minerRate = rate / (totalFreeMiner)
	minerRate = _minerRate

	await storageMinerData (EPOCH, WalletIpaddress)

	logger(Colors.blue(`Epoch ${EPOCH} total wallet ${WalletIpaddress.size} Total IPAddress ${ipaddressWallet.size} rate ${rate} success!`))
}


const startListeningCONET_Holesky_EPOCH_v2 = async (v3: v3_master) => {
	
	EPOCH = await provider.getBlockNumber()
	await initdata(v3)
	provider.on('block', async _block => {
		if (_block === EPOCH + 1) {
			EPOCH++
			logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 epoch [${_block}] fired!`))
			await transferMiners(_block, v3.WalletIpaddress, v3.ipaddressWallet)
		}
		
	})

	logger(Colors.grey(`Cluster startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))
}


let initdataing = false
const initdata = async (v3: v3_master) => {
	if (initdataing) {
		return
	}
	initdataing = true
	const nodes: any[]|void  = await getAllMinerNodes()

	if (!nodes) {
		initdataing = false
		return logger(Colors.red(`initdata return NULL! `))
	}
	
	nodes.forEach(n => {
		const w = n.wallet.toLowerCase()
		v3.regiestNodes.set(w, n.node_ipaddress)
		
	})

	logger(Colors.blue(`Daemon initdata regiestNodes = ${inspect(v3.regiestNodes.entries(), false, 3, true)}`))
	initdataing = false
}

const checkNodeWallet: (nodeWallet: string, checkInit: boolean, v3: v3_master) => Promise<boolean> = async (nodeWallet, checkInit, v3) => {

	let wallet = v3.regiestNodes.get(nodeWallet)
	if (!wallet) {
		await initdata(v3)
		wallet = v3.regiestNodes.get(nodeWallet)
	}

	if (!wallet) {
		logger (Colors.red(`Daemon checkNodeWallet node [${nodeWallet}] hasn't in nodelist ERROR! `), inspect(v3.regiestNodes.entries(), false, 3, true))
		return false
	}

	if (!checkInit) {
		
		logger(Colors.red(`checkNodeWallet [${nodeWallet}] nodeIpaddressWallets set new Empty Map() nodeIpaddressWallets.get(nodeWallet) = [${inspect(v3.nodeIpaddressWallets.get(nodeWallet), false, 3, true)}]! checkInit return true`))
		return true
	}

	const nodeInited = v3.nodeIpaddressWallets.has (nodeWallet)
	if (!nodeInited) {
		logger (Colors.red(`Daemon checkNodeWallet node [${nodeWallet}] hasn't Inited nodeIpaddressWallets size = ${v3.nodeIpaddressWallets.size}`), inspect(v3.nodeIpaddressWallets.keys(), false, 3, true))
		return false
	}
	
	return true
}

const cleanupNode = (nodeWallet: string, v3: v3_master) => {
	const nodeIPWallets = v3.nodeIpaddressWallets.get(nodeWallet)

	if (!nodeIPWallets) {
		return logger(Colors.red(`cleanupNode [${nodeWallet}] nodeWalletsIP empty!`))
	}

	nodeIPWallets.forEach((n, key) => {
		v3.ipaddressWallet.delete(key)
		v3.WalletIpaddress.delete(n)
	})
	v3.nodeIpaddressWallets.delete(nodeWallet)
}
logger(`LOCAL PATH = ${homedir()}`)

const localIPFS_path = join(homedir(), '.data')

const storageLocalIPFS = async (obj: {hash: string, data: string}) => new Promise(resolve => {
	const savePath = join(localIPFS_path, obj.hash)
	logger(savePath)
	return writeFile(savePath, obj.data, 'utf-8', err => {
		if (err) {
			resolve (false)
			return logger(`storageLocalIPFS ${obj.hash} got Error!`, err.message)
		}
		resolve (true)
		return logger(`storageLocalIPFS ${obj.hash} Success!`)
	})
})
	


const storageMinerData = async (block: number, WalletIpaddress: Map<string, string>) => {
	//	obj: {hash?: string, data?: string}
	const walletsArray: string[] = []
	WalletIpaddress.forEach((n, key) => {
		walletsArray.push(key)
	})

	const obj = {
		hash: `free_wallets_${block}`,
		data: JSON.stringify(walletsArray)
	}

	await Promise.all([
		storageIPFS(obj, masterSetup.conetFaucetAdmin[0]),
		storageLocalIPFS (obj)
	])

	return logger(Colors.red(`storage [free_wallets_${block}] Miner wallets [${ walletsArray.length }]to Wasabi success! `))
}

const developIP = ['38.102.87.58','207.90.195.68','73.170.63.192']

const checkDevelopIP = (ipaddress: string) => {
	const index = developIP.findIndex(v => v === ipaddress)
	return index <0 ? false: true
}

class v3_master {

	private PORT = 8002
	public ipaddressWallet: Map<string, string> = new Map()
	public WalletIpaddress: Map<string, string> = new Map()
	public regiestNodes: Map<string, string> = new Map()
	public nodeIpaddressWallets: Map<string, Map<string, string>> = new Map()
	constructor () {
		
		this.startServer()
    }

	private startServer = async () => {
		await startListeningCONET_Holesky_EPOCH_v2(this)
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use(Express.json())
		app.use( '/api', router )
		
		app.use(Express.json({limit: '300mb'}));
		app.use(Express.urlencoded({limit: '300mb'}));
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
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(406).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, '127.0.0.1',() => {
			
			return console.table([
                { 'newMiningCluster': `startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
	}

	private router ( router: Router ) {
		
		router.post ('/wallet',  async (req, res) =>{
			
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
				const contract = new ethers.Contract(conet_Referral_contractV3, CONET_Referral_ABI, provider)
				address = await contract.getReferrer(wallet)
			} catch (ex){
				logger(Colors.red(`contract.getReferrer Error!`))
				return res.status(200).json({}).end()
			}

			if (!address) {
				address = '0x0000000000000000000000000000000000000000'
			}
			address = address.toLowerCase()
			
			ReferralsMap.set(wallet, address)
			logger(Colors.grey(`address = [${address}] ReferralsMap Total Length = [${ReferralsMap.size}]`))
			return res.status(200).json({address}).end()
		})

		router.post ('/pay',  async (req, res) =>{


			let walletList: string[]
			let payList: string[]
			try {
				walletList = req.body.walletList
				payList = req.body.payList
			} catch (ex) {
				logger (Colors.grey(`request /pay req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			res.status(200).json({}).end()
			
			transferPool.push({
				privateKey: masterSetup.conetFaucetAdmin[0],
				walletList: walletList,
				payList: payList
			})
			
			return await startTransfer()
		})

		router.post ('/guardians-data',  async (req, res) => {

			let epoch: string
			let totalNodes: string
			try {
				epoch = req.body.epoch
				totalNodes = req.body.totalNodes
			} catch (ex) {
				logger (Colors.grey(`request /pay req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			res.status(200).end()

			//await storeLeaderboardGuardians_referralsv2(epoch,)

			const index = epochRate.findIndex ( n => n.epoch === epoch )
			if (index < 0) {
				return epochRate.push({
					epoch, totalNodes, totalMiner: ''
				})
			}
			epochRate[index].totalNodes = totalNodes
			await storeToChain(epochRate[index])
			epochRate.splice(index, 1)[0]
		})


		router.post('/minerCheck',  async (req, res) =>{
			
			let walletAddress: string, ipAddress: string, nodeAddress: string
			try {
				walletAddress = req.body.walletAddress1
				ipAddress = req.body.ipAddress
				nodeAddress = req.body.walletAddress

			} catch (ex) {
				logger (Colors.red(`Daemon /minerCheck req.body walletAddress1 ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			const addToPool = (a_ipAddress: string, a_walletAddress: string) => {
				logger(`${a_ipAddress}:${a_walletAddress} addToPool !`)
				this.ipaddressWallet.set(a_ipAddress, a_walletAddress)
				this.WalletIpaddress.set(a_walletAddress, a_ipAddress)
				const nodeIPWallets = this.nodeIpaddressWallets.get(nodeAddress)
				if (!nodeIPWallets) {
					logger(Colors.red(`Daemon /minerCheck node [${nodeAddress}] hasn't nodeIPWallets Error!`))
				} else {
					nodeIPWallets.set(a_ipAddress, a_walletAddress)
				}
				return res.status(200).json({totalMiner: this.ipaddressWallet.size}).end()
			}

			if (! await checkNodeWallet(nodeAddress, true, this)) {
				return res.status(401).end()
			}

			let isDeveloper = false
			

			if (checkDevelopIP(ipAddress)) {
				ipAddress = v4()
				isDeveloper = true
			}

			if (ipAddress === undefined) {
				return res.status(400).end()
			}

			const _wallet = this.ipaddressWallet.get(ipAddress)
			const _wallet_ip = this.WalletIpaddress.get(walletAddress = walletAddress.toLowerCase())


			if (!_wallet) {

				//	totaly new
				if (!_wallet_ip) {
					return addToPool(ipAddress, walletAddress)
				}

				//	wallet changed IP address
				//	reove the IP address 
				this.WalletIpaddress.delete(_wallet_ip)
				return addToPool(ipAddress, walletAddress)

			}

			//		IP address used by another Wallet
			if (_wallet !== walletAddress) {
				logger(`/minerCheck ${walletAddress}:${ipAddress} !== ${_wallet}:${_wallet_ip} Error!`)
				return res.status(400).end()
			}

			//	same wallet
			return addToPool(ipAddress, walletAddress)
			
		})

		router.post('/deleteMiner',  async (req, res) =>{

			let walletAddress, ipAddress, nodeAddress
			try {
				walletAddress = req.body.walletAddress1
				ipAddress = req.body.ipAddress
				nodeAddress = req.body.walletAddress

			} catch (ex) {
				logger (Colors.red(`Daemon /deleteMiner req.body walletAddress1 ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}
			
			
			if (! await checkNodeWallet(nodeAddress, true, this)) {
				
				return res.status(401).end()
			}

			
			walletAddress=walletAddress.toLowerCase()
			//obj = {ipaddress, wallet, walletAddress: nodeWallet}
			if (ipAddress === developIP) {
				const ips = this.WalletIpaddress.get (walletAddress)

				if (!ips) {
					logger(Colors.red(`/deleteMiner ${developIP} cant get WalletIpaddress.get(${walletAddress})`))
				} else {
					ipAddress = ips
				}
			}
			
			this.ipaddressWallet.delete(ipAddress)
			this.WalletIpaddress.delete(walletAddress)

			const nodeIPWallets = this.nodeIpaddressWallets.get(nodeAddress)

			if (!nodeIPWallets) {
				logger(Colors.red(`Daemon /deleteMiner node [${nodeAddress}] hasn't nodeIPWallets Error!`))
			} else {
				nodeIPWallets.delete(ipAddress)
			}
			
			logger(Colors.gray(`Daemon /deleteMiner [${ipAddress}:${walletAddress}] Total Miner = [${this.WalletIpaddress.size}]`))
			return res.status(200).json({totalMiner: this.WalletIpaddress.size}).end()
		})

		router.post('/nodeRestart',  async (req, res) =>{

			let obj:minerObj = req.body
			if ( !obj) {
				return res.status(402).end()
			}

			if (! await checkNodeWallet(obj.walletAddress, false, this)) {
				return res.status(403).end()
			}

			const _nodeObj = this.nodeIpaddressWallets.get (obj.walletAddress)

			if (_nodeObj) {
				const init = _nodeObj.get('initing')

				//	already init
				if (init) {
					return res.status(200).end()
				}

				cleanupNode(obj.walletAddress, this)

			}

			
			
			//		setup INITing
			const nodeIPWallets = new Map()
			nodeIPWallets.set('initing','true')
			this.nodeIpaddressWallets.set(obj.walletAddress, nodeIPWallets)

			const data: minerArray[] = obj?.data

			if (data) {
				data.forEach( n => {
					let _ip = this.WalletIpaddress.get(n.wallet)
					if (_ip && checkDevelopIP(n.address)){
						n.address = _ip
					}
					if (checkDevelopIP(n.address)) {
						n.address = v4()
					}
					
					this.ipaddressWallet.set(n.address, n.wallet)
					this.WalletIpaddress.set(n.wallet, n.address)
					
					nodeIPWallets.set(n.address, n.wallet)
					this.nodeIpaddressWallets.set(obj.walletAddress, nodeIPWallets)
				})
			}

			nodeIPWallets.delete('initing')

			logger(Colors.green(`/nodeRestart added node [${obj.walletAddress}] wallets [${this.nodeIpaddressWallets.get(obj.walletAddress)?.size}]! `))
			return res.status(200).end()
		})

		router.post('/getTotalMiners',  async (req, res) => {

			let ipAddress, nodeAddress
			try {
				ipAddress = req.body.ipAddress
				nodeAddress = req.body.walletAddress

			} catch (ex) {
				logger (Colors.red(`Daemon /deleteMiner req.body walletAddress1 ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}
			
			if (! await checkNodeWallet(nodeAddress, true, this)) {
				return res.status(401).end()
			}

			const responseData = {totalMiner: this.WalletIpaddress.size, tokensEachEPOCH, minerRate: ethers.formatEther(minerRate)}
			return res.status(200).json(responseData).end()
		})

		router.all ('*', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`[${ipaddress}] => Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(410).end()
			return res.socket?.end().destroy()
		})
	}
}

export default v3_master
