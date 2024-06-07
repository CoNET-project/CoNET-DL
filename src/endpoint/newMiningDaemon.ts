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
import {conet_Referral_contractV2, masterSetup, checkSignObj, storageWalletProfile, s3fsPasswd} from '../util/util'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import {logger} from '../util/logger'
import {v4} from 'uuid'
import { cpus } from 'node:os'
import epochRateABI from '../util/epochRate.json'


const ReferralsMap: Map<string, string> = new Map()
const conet_Holesky_rpc = 'https://rpc.conet.network'

const ReferralsV2Addr = '0x64Cab6D2217c665730e330a78be85a070e4706E7'.toLowerCase()
const epochRateAddr = '0x9991cAA0a515F22386Ab53A5f471eeeD4eeFcbD0'

const checkBlockEvent = async (block: number, provider: ethers.JsonRpcProvider) => {
	const blockDetail = await provider.getBlock(block)
	if (!blockDetail?.transactions) {
		return logger(Colors.gray(`Block ${block} hasn't transactions SKIP!`))
	}

	for (let u of blockDetail.transactions) {
		await detailTransfer(u, provider)
	}

}

interface epochRate {
	totalNodes:string
	epoch: string
	totalMiner: string
}

const epochRate: epochRate[]= []

const detailTransfer = async (transferHash: string, provider: ethers.JsonRpcProvider) => {
	const transObj = await provider.getTransactionReceipt(transferHash)
	const toAddr = transObj?.to
	if ( toAddr && toAddr.toLowerCase() === ReferralsV2Addr) {
		
		const wallet = transObj.from.toLowerCase()
		logger(Colors.grey(`ReferralsV2Addr has event! from ${wallet}`))
		let address
		try {
			const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
			address = await contract.getReferrer(wallet)
		} catch (ex){
			logger(Colors.red(`detailTransfer contract.getReferrer Error!`))
			return
		}

		if (!address || address === '0x0000000000000000000000000000000000000000') {
			return logger(Colors.red(`detailTransfer contract.getReferrer get null address`))
		}
		address = address.toLowerCase()
		ReferralsMap.set(wallet, address)
		logger(Colors.blue(`detailTransfer add Referrer [${wallet} => ${address}] to ReferralsMap success! ReferralsMap length = [${ReferralsMap.size}]`))
	}
}


const storeToChain = async (data: epochRate) => {
	logger(inspect(data, false, 3, true))
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
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



const initAllServers: Map<string, string> = new Map()

interface regiestNodes {
	wallet: string
	node_ipaddress: string

}

let EPOCH=0
let s3Pass: s3pass|null = null

const storageMinerData = async (block: number) => {
	//	obj: {hash?: string, data?: string}
	const walletsArray: string[] = []
	if (!s3Pass) {
		return logger(Colors.red(`storageMinerData s3Pass null Error!`))
	}
	WalletIpaddress.forEach((n, key) => {
		walletsArray.push(key)
	})
	if (walletsArray.length===0) {
		return logger(Colors.red(`storageMinerData WalletIpaddress has empty Error!`))
	}

	const obj = {
		hash: `free_wallets_${block}`,
		data: JSON.stringify(walletsArray)
	}

	await storageWalletProfile(obj, s3Pass)
	return logger(Colors.red(`storage [free_wallets_${block}] Miner wallets [${ walletsArray.length }]to Wasabi success! `))
}


export const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)

	provideCONET.on('block', async block => {
		EPOCH = block
		logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 epoch [${block}] fired!`))
		//await storageMinerData(block)
	})

	EPOCH = await provideCONET.getBlockNumber()
	await initdata()
	s3Pass = await s3fsPasswd()
	logger(Colors.grey(`startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))
}

const ipaddressWallet: Map<string, string> = new Map()
const WalletIpaddress: Map<string, string> = new Map()
const regiestNodes: Map<string, string> = new Map()

const nodeIpaddressWallets: Map<string, Map<string, string>> = new Map()

const testNodeWallet = '0x22c2e3b73af3aceb57c266464538fa43dfd265de'.toLowerCase()

const initdata = async () => {
	const nodes: any[]|void  = await getAllMinerNodes()
	if (!nodes) {
		return logger(Colors.red(`initdata return NULL! `))
	}
	
	nodes.forEach(n => {
		const w = n.wallet.toLowerCase()
		// if (w === testNodeWallet) {
		// 	return
		// }
		
		regiestNodes.set(n.wallet, n.node_ipaddress)
		
	})

	logger(Colors.blue(`Daemon initdata regiestNodes = ${inspect(regiestNodes.entries(), false, 3, true)}`))
}

const checkNodeWallet: (nodeWallet: string, checkInit: boolean) => Promise<boolean> = async (nodeWallet, checkInit) => {
	let wallet = regiestNodes.get(nodeWallet)
	if (!wallet) {
		await initdata()
		wallet = regiestNodes.get(nodeWallet)
	}
	if (!wallet) {
		logger (Colors.red(`Daemon checkNodeWallet node [${nodeWallet}] hasn't in nodelist ERROR! `), inspect(regiestNodes.entries(), false, 3, true))
		return false
	}

	if (!checkInit) {
		nodeIpaddressWallets.set(nodeWallet, new Map())
		logger(Colors.red(`checkNodeWallet [${nodeWallet}] nodeIpaddressWallets set new Empty Map() nodeIpaddressWallets.get(nodeWallet) = [${nodeIpaddressWallets.get(nodeWallet)}]!checkInit return true`))
		return true
	}

	const nodeInited = nodeIpaddressWallets.has (nodeWallet)
	if (!nodeInited) {
		logger (Colors.red(`Daemon checkNodeWallet node [${nodeWallet}] hasn't Inited nodeIpaddressWallets size = ${nodeIpaddressWallets.size}`), inspect(nodeIpaddressWallets.entries(), false, 3, true)
		return false
	}
	logger(Colors.red(`checkNodeWallet return true`))
	return true
}

const cleanupNode = (nodeWallet: string) => {
	const nodeIPWallets = nodeIpaddressWallets.get(nodeWallet)
	if (!nodeIPWallets) {
		return logger(Colors.red(`cleanupNode [${nodeWallet}] nodeWalletsIP empty!`))
	}
	nodeIPWallets.forEach((n, key) => {
		ipaddressWallet.delete(key)
		WalletIpaddress.delete(n)
	})
	nodeIpaddressWallets.delete(nodeWallet)
}


class v3_master {

	private PORT = 8002

	constructor () {
		this.startServer()
    }

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use(Express.json())
		app.use( '/api', router )
		
		app.use(Express.json({limit: '100mb'}));
		app.use(Express.urlencoded({limit: '100mb'}));
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
			startListeningCONET_Holesky_EPOCH_v2()
			return console.table([
                { 'newMiningCluster': ` startup success ${ this.PORT } Work [${workerNumber}]` }
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
				const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
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
			const ipaddress = getIpAddressFromForwardHeader(req)

			if (!ipaddress ||! /\:\:1|\:\:ffff\:127\.0\.0\.1/.test(ipaddress)) {
				logger(Colors.red(`[${ipaddress}] access Local only area Error! `))
				res.end()
				return res?.socket?.destroy()
			}

			let walletList: string[]
			let payList: string[]
			try {
				walletList = req.body.walletList
				payList = req.body.payList
			} catch (ex) {
				logger (Colors.grey(`request /pay req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			res.status(200).end()
			
			transferPool.push({
				privateKey: masterSetup.GuardianReferralsFree,
				walletList: walletList,
				payList: payList
			})
			
			return await startTransfer()
		})

		router.post ('/guardians-data',  async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress ||! /\:\:1|\:\:ffff\:127\.0\.0\.1/.test(ipaddress)) {
				logger(Colors.red(`[${ipaddress}] access Local only area Error! `))
				res.end()
				return res?.socket?.destroy()
			}
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
			// await storeLeaderboardGuardians_referralsv2(epoch,)
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

		router.post ('/free-data',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress ||! /\:\:1|\:\:ffff\:127\.0\.0\.1/.test(ipaddress)) {
				logger(Colors.red(`[${ipaddress}] access Local only area Error! `))
				res.end()
				return res?.socket?.destroy()
			}

			logger(Colors.blue(`${ipaddress} => /guardians-data`))
			
			let epoch: string
			let minerRate
			let totalMiner
			try {
				epoch = req.body.epoch
				minerRate = req.body.minerRate
				totalMiner = req.body.totalMiner

			} catch (ex) {
				logger (Colors.grey(`request /pay req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			res.status(200).end()
			logger(Colors.blue(`minerRate = ${minerRate} totalMiner = ${totalMiner}`))
			// await storeLeaderboardFree_referrals(epoch, referrals, cntp, referrals_rate_list, totalMiner.toString(), minerRate.toString())
			
			const index = epochRate.findIndex(n => n.epoch=== epoch)
			if (index < 0) {
				return epochRate.push({
					epoch, totalNodes:'', totalMiner
				})
			}
			epochRate[index].totalMiner = totalMiner
			await storeToChain(epochRate[index])
			epochRate.splice(index, 1)[0]
		})

		router.post('/minerCheck',  async (req, res) =>{
			logger(Colors.magenta(`/minerCheck`))
			let walletAddress, ipAddress, nodeAddress
			try {
				walletAddress = req.body.walletAddress
				ipAddress = req.body.ipAddress
				nodeAddress = req.body.nodeAddress

			} catch (ex) {
				logger (Colors.red(`Daemon /minerCheck req.body walletAddress1 ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}
			
			logger(Colors.blue(`Daemon /minerCheck `), inspect(req.body, false, 3, true))

			if (!walletAddress || !ipAddress || !nodeAddress) {
				logger (Colors.red(`Daemon /minerCheck req.body walletAddress1 ERROR! !walletAddress || !ipAddress || !nodeAddress = ${!walletAddress} || ${!ipAddress} || ${!nodeAddress}`))
				return res.status(404).end()
			}

			if (! await checkNodeWallet(nodeAddress, true)) {
				return res.status(401).end()
			}

			if (ipAddress === '23.16.211.100') {
				ipAddress = v4()
			}

			const _wallet = ipaddressWallet.get(ipAddress)
			const _wallet_ip = WalletIpaddress.get(walletAddress = walletAddress.toLowerCase())
			
			if ( _wallet || _wallet_ip ) {
				res.status(400).end()
				return //logger(Colors.grey(`Router /minerCheck [${ipaddress}:${obj.walletAddress}] Miner [${obj.ipAddress}:${obj.walletAddress1}] already in Pool`))
			}

			ipaddressWallet.set(ipAddress, walletAddress)
			WalletIpaddress.set(walletAddress, ipAddress)
			const nodeIPWallets = nodeIpaddressWallets.get(nodeAddress)

			if (!nodeIPWallets) {
				logger(Colors.red(`Daemon /minerCheck node [${nodeAddress}] hasn't nodeIPWallets Error!`))
			} else {
				nodeIPWallets.set(ipAddress, walletAddress)
			}
			return res.status(200).json({totalMiner: ipaddressWallet.size}).end()
		})

		router.post('/deleteMiner',  async (req, res) =>{

			let walletAddress, ipAddress, nodeAddress
			try {
				walletAddress = req.body.walletAddress
				ipAddress = req.body.ipAddress
				nodeAddress = req.body.nodeAddress

			} catch (ex) {
				logger (Colors.red(`Daemon /deleteMiner req.body JSON FORMAT ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!walletAddress || !ipAddress || !nodeAddress) {
				logger (Colors.red(`Daemon /deleteMiner req.body walletAddress1 ERROR! !walletAddress || !ipAddress || !nodeAddress = ${!walletAddress} || ${!ipAddress} || ${!nodeAddress}`))
				return res.status(404).end()
			}
			
			if (! await checkNodeWallet(nodeAddress, true)) {
				return res.status(401).end()
			}
			
			walletAddress=walletAddress.toLowerCase()
			//obj = {ipaddress, wallet, walletAddress: nodeWallet}
			if (ipAddress === '23.16.211.100') {
				const ips = WalletIpaddress.get (walletAddress)
				if (!ips) {
					logger(Colors.red(`/deleteMiner 23.16.211.100 cant get WalletIpaddress.get(${walletAddress})`))
				} else {
					ipAddress = ips
				}
			}
			
			ipaddressWallet.delete(ipAddress)
			WalletIpaddress.delete(walletAddress)

			const nodeIPWallets = nodeIpaddressWallets.get(nodeAddress)

			if (!nodeIPWallets) {
				logger(Colors.red(`Daemon /deleteMiner node [${nodeAddress}] hasn't nodeIPWallets Error!`))
			} else {
				nodeIPWallets.delete(ipAddress)
			}
			
			logger(Colors.gray(`Daemon /deleteMiner [${ipAddress}:${walletAddress}] Total Miner = [${WalletIpaddress.size}]`))
			return res.status(200).json({totalMiner: WalletIpaddress.size}).end()
		})

		router.post('/nodeRestart',  async (req, res) =>{

			let obj:minerObj = req.body
			if ( !obj) {
				return res.status(402).end()
			}

			if (! await checkNodeWallet(obj.walletAddress, false)) {
				return res.status(403).end()
			}

			cleanupNode(obj.walletAddress)
			const data: minerArray[] = obj?.data
			if (data) {
				data.forEach( n => {
					let _ip = WalletIpaddress.get(n.wallet)
					if (_ip && n.address === '23.16.211.100'){
						n.address = _ip
					}
					if (n.address ==='23.16.211.100') {
						n.address = v4()
					}
					const nodeIPWallets = new Map()
					ipaddressWallet.set(n.address, n.wallet)
					WalletIpaddress.set(n.wallet, n.address)
					
					nodeIPWallets.set(n.address, n.wallet)
					nodeIpaddressWallets.set(obj.walletAddress, nodeIPWallets)
				})
			}

			
			return res.status(200).end()
		})



		router.post('/getTotalMiners',  async (req, res) => {
			logger(Colors.blue(`/getTotalMiners`))
			let walletAddress
			try {
				walletAddress = req.body.walletAddress
			} catch (ex) {
				logger (Colors.red(`Daemon /getTotalMiners req.body JSON FORMAT ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!walletAddress) {
				logger (Colors.red(`Daemon /getTotalMiners req.body nodeAddress ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (! await checkNodeWallet(walletAddress, true)) {
				return res.status(401).end()
			}

			logger(Colors.blue(`send json ${{totalMiner: ipaddressWallet.size}}`))
			return res.status(200).json({totalMiner: ipaddressWallet.size}).end()
		})

		router.all ('*', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`[${ipaddress}] => Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(405).end()
			return res.socket?.end().destroy()
		})
	}
}

export default v3_master