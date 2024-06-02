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
import epochRateABI from '../util/epochRate.json'


const ReferralsMap: Map<string, string> = new Map()
const conet_Holesky_rpc = 'http://207.90.195.83:9999'

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
	if (!s3Pass) {
		return logger(Colors.red(`storageMinerData s3Pass null Error!`))
	}
	
	const obj = {
		hash: `free_wallets_${block}`,
		data: JSON.stringify(totalWalletcalculations)
	}

	await storageWalletProfile(obj, s3Pass)
	return logger(Colors.magenta(`storage [free_wallets_${block}] Miner wallets [${ totalWalletcalculations.length }]to Wasabi success! `))
}



let totalWalletcalculations: string[] = []

const calculationsTotal = () => {
	let all = true
	regiestNodes.forEach((n, key) => {
		const uu = nodeWallets.get (key)
		if (!uu) {
			all = false
			logger(Colors.red(`node name [${n}] has no data in nodeWallets `))
		}
	})

	let ws:string[] = []
	if (all) {
		regiestNodes.forEach((n, v) => {
			const _nodeWallets = nodeWallets.get(v)
			if (_nodeWallets) {
				ws = [...ws, ..._nodeWallets]
			}
			
		})
		totalWalletcalculations = ws
	}
	
	
	logger(Colors.red(`calculationsTotal calculationsTotal regiestNodes size = [${regiestNodes.size}] nodeWallets size = [${nodeWallets.size}] all = [${all}] WalletIpaddress size = [${WalletIpaddress.size}] totalWalletcalculations [${totalWalletcalculations.length}] `))

}
export const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	

	provideCONET.on('block', async block => {
		EPOCH = block

		await storageMinerData(block)
	})

	EPOCH = await provideCONET.getBlockNumber()
	await initdata()
	s3Pass = await s3fsPasswd()
	logger(Colors.magenta(`startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))
}

const ipaddressWallet: Map<string, string> = new Map()
const WalletIpaddress: Map<string, string> = new Map()
const regiestNodes: Map<string, string> = new Map()
const nodeWallets: Map<string, string[]> = new Map()


const initdata = async () => {
	const nodes: any[]|void  = await getAllMinerNodes()
	if (!nodes) {
		return logger(Colors.red(`initdata return NULL! `))
	}
	logger(inspect(nodes, false, 3, true))
	nodes.forEach(n => {

		regiestNodes.set(n.wallet, "1")

	})

	logger(Colors.blue(`initdata regiestNodes = ${inspect(regiestNodes.entries(), false, 3, true)}`))
}

class conet_dl_v3_server {

	private PORT = 8001

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

		app.use (async (req, res, next) => {
			if (/^post$/i.test(req.method)) {
				return Express.json({limit: '25mb'})(req, res, err => {
					if (err) {
						res.sendStatus(400).end()
						res.socket?.end().destroy()
						return logger(Colors.red(`/^post$/i.test Express.json Error ${req.url} ! ${JSON.stringify(req.body)}`))
						
					}
					return next()
				})
			}
			return next()
		})

		const server = createServer(app)

		this.router (router)

		app.all ('*', (req, res) => {
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, () => {
			startListeningCONET_Holesky_EPOCH_v2()
			return console.table([
                { 'newMiningCluster': ` startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
	}

	private router ( router: Router ) {
		
		router.post ('/wallet',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress ||! /\:\:1|\:\:ffff\:127\.0\.0\.1/.test(ipaddress)) {
				logger(Colors.red(`[${ipaddress}] access Local only area Error! `))
				res.end()
				return res?.socket?.destroy()
			}
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
			const ipaddress = getIpAddressFromForwardHeader(req)
			// logger(Colors.blue(`${ipaddress} => /minerCheck`))

			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /minerCheck message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /minerCheck !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj||!obj?.ipAddress||!obj?.walletAddress1) {
				logger (Colors.grey(`[${ipaddress}] to /minerCheck !obj Error! ${inspect(obj, false, 3, true)}`))
				return res.status(404).end()
			}

			let _ip = regiestNodes.get (obj.walletAddress)

			if (!_ip) {
				await initdata()
				_ip = regiestNodes.get (obj.walletAddress)

			}
			if (!_ip) {
				logger (Colors.grey(`Router /deleteMiner [${ipaddress}:${obj.walletAddress}] wallet didn't in nodes wallet `))
				return res.status(404).end()
			}

			const nodeInit = initAllServers.get(obj.walletAddress)
			if (!nodeInit) {
				return res.status(401).end()
			}
			//obj = {ipaddress, wallet, walletAddress: nodeWallet}
			if (obj.ipAddress === '23.16.211.100') {
				obj.ipAddress = v4()
			}
			const _wallet = ipaddressWallet.get(obj.ipAddress)
			const _wallet_ip = WalletIpaddress.get(obj.walletAddress1 = obj.walletAddress1.toLowerCase())
			
			if ( _wallet || _wallet_ip ) {
				res.status(400).end()
				return //logger(Colors.grey(`Router /minerCheck [${ipaddress}:${obj.walletAddress}] Miner [${obj.ipAddress}:${obj.walletAddress1}] already in Pool`))
			}

			ipaddressWallet.set(obj.ipAddress, obj.walletAddress1)
			WalletIpaddress.set(obj.walletAddress1, obj.ipAddress)

			
			logger(Colors.gray(`${obj.ipAddress}:${obj.walletAddress1} added to Miner Pool [${WalletIpaddress.size}]`))
			res.status(200).json({totalMiner: totalWalletcalculations.length}).end()
			calculationsTotal()
		})

		router.post('/deleteMiner',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.blue(`${ipaddress} => /deleteMiner`))

			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /deleteMiner message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /deleteMiner !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj||!obj.ipAddress||!obj.walletAddress1) {
				logger (Colors.grey(`[${ipaddress}] to /deleteMiner !obj Error! ${inspect(obj, false, 3, true)}`))
				return res.status(404).end()
			}

			let _ip = regiestNodes.get (obj.walletAddress)

			if (!_ip) {
				await initdata()
				_ip = regiestNodes.get (obj.walletAddress)
			}

			if (!_ip) {
				logger (Colors.grey(`Router /deleteMiner [${ipaddress}:${obj.walletAddress}] wallet didn't in nodes wallet `))
				return res.status(404).end()
			}

			const nodeInit = initAllServers.get(obj.walletAddress)
			if (!nodeInit) {
				return res.status(401).end()
			}

			//obj = {ipaddress, wallet, walletAddress: nodeWallet}
			if (obj.ipAddress === '23.16.211.100') {
				const ips = WalletIpaddress.get (obj.walletAddress1 = obj.walletAddress1.toLowerCase())
				if (!ips) {
					logger(Colors.red(`/deleteMiner 23.16.211.100 cant get WalletIpaddress.get(${obj.walletAddress1.toLowerCase()})`))
				} else {
					obj.ipAddress = ips
				}
			}
			// const ipAdd = WalletIpaddress.get (obj.walletAddress1.toLowerCase())
			// if (!ipAdd) {

			// }
			ipaddressWallet.delete(obj.ipAddress)
			WalletIpaddress.delete(obj.walletAddress1)
			
			logger(Colors.gray(`/deleteMiner [${obj.ipAddress}:${obj.walletAddress1}] Total Miner = [${WalletIpaddress.size}]`))
			res.status(200).json({totalMiner: totalWalletcalculations.length}).end()
			calculationsTotal()
		})


		router.post('/initNode',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.blue(`${ipaddress} => /initNode`))

			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /initNode message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /initNode !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj||!obj?.data) {
				logger (Colors.grey(`[${ipaddress}] to /initNode !obj Error! ${inspect(obj, false, 3, true)}`))
				return res.status(404).end()
			}

			let _ip = regiestNodes.get (obj.walletAddress = obj.walletAddress.toLowerCase())

			if (!_ip) {
				await initdata()
				_ip = regiestNodes.get (obj.walletAddress)
				if (!_ip) {
					logger (Colors.grey(`Router /initNode [${ipaddress}:${obj.walletAddress}] wallet didn't in nodes wallet `))
					return res.status(404).end()
				}
			}
			//obj = {ipaddress, wallet, walletAddress: nodeWallet}
			
			const data: minerArray[]  = obj.data
			const allWallets: string[] = []

			data.forEach(n => {
				const minerip = WalletIpaddress.get(n.wallet)
				if (minerip && n.address === '23.16.211.100'){
					n.address = minerip
				}
				if (n.address ==='23.16.211.100') {
					n.address = v4()
				}

				allWallets.push(n.wallet)
				ipaddressWallet.set(n.address, n.wallet)
				WalletIpaddress.set(n.wallet, n.address)
			})

			nodeWallets.set(obj.walletAddress, allWallets)
			calculationsTotal()

			setTimeout (() => {
				initAllServers.delete(obj.walletAddress)
				const Wallets = nodeWallets.get (obj.walletAddress)
				Wallets?.forEach(n => {
					const ip = WalletIpaddress.get (n)
					if (ip) {
						ipaddressWallet.delete(ip)
					}
					WalletIpaddress.delete(n)
				})
			}, 1000 * 60 * (2 + 5 *Math.random ()))
			
			logger(Colors.blue(`/initNode node name = [${obj.walletAddress}] added new miners [${data.length}] Total Miner in WalletIpaddress = [${WalletIpaddress.size}] totalWalletcalculations length =[${totalWalletcalculations.length}]`))
			
			res.status(200).end()
			
		})

		router.post('/nodeRestart',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.blue(`${ipaddress} => /initNode`))

			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /nodeRestart message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /nodeRestart !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`[${ipaddress}] to /nodeRestart !obj Error! ${inspect(obj, false, 3, true)}`))
				return res.status(404).end()
			}

			let _ip = regiestNodes.get (obj.walletAddress)

			if (!_ip) {
				await initdata()
				_ip = regiestNodes.get (obj.walletAddress)
				if (!_ip) {
					logger (Colors.red(`Router /nodeRestart [${ipaddress}:${obj.walletAddress}] wallet didn't in nodes wallet `))
					return res.status(404).end()
				}
			}
			logger(Colors.magenta(`/nodeRestart start delete node [${obj.walletAddress}] start! total wallet = [${WalletIpaddress.size}]`))
			const allwallets = nodeWallets.get(obj.walletAddress)
			if (allwallets?.length) {
				allwallets.forEach(n => {
					const ipaddress = WalletIpaddress.get(n)
					if (!ipaddress) {
						logger(Colors.red(`/nodeRestart [${n}] can't got IP address!`))
					} else {
						ipaddressWallet.delete(ipaddress)
					}
					WalletIpaddress.delete(n)
				})
			}
			
			logger(Colors.magenta(`/nodeRestart finished total wallet = [${WalletIpaddress.size}]`))
			res.status(200).json({totalMiner: totalWalletcalculations.length}).end()
			return calculationsTotal()
		})

		router.post('/getTotalMiners',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.blue(`${ipaddress} => /getTotalMiners`))

			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /deleteMiner message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
			}

			if (!message||!signMessage) {
				logger (Colors.grey(`Router /deleteMiner !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`[${ipaddress}] to /deleteMiner !obj Error! ${inspect(obj, false, 3, true)}`))
				return res.status(404).end()
			}

			let _ip = regiestNodes.get (obj.walletAddress)

			if (!_ip) {
				await initdata()
				_ip = regiestNodes.get (obj.walletAddress)
			}

			if (!_ip) {
				logger (Colors.grey(`Router /deleteMiner [${ipaddress}:${obj.walletAddress}] wallet didn't in nodes wallet `))
				return res.status(404).end()
			}

			const nodeInit = initAllServers.get(obj.walletAddress)

			if (!nodeInit) {
				logger(Colors.red(`Node [${obj.walletAddress}] need nodeInit!`))
				return res.status(401).end()
			}
			calculationsTotal()
			//obj = {ipaddress, wallet, walletAddress: nodeWallet}
			return res.status(200).json({totalMiner: totalWalletcalculations.length}).end()
		})

		router.all ('*', (req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`[${ipaddress}] => Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

new conet_dl_v3_server()
