/**
 * 			
 * */
import Express, { Router } from 'express'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import {ethers} from 'ethers'
const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`
import {startListeningCONET_Holesky_EPOCH_v2, addIpaddressToLivenessListeningPool, getIpAddressFromForwardHeader, checkMiner, launshAndDeleteAllWalletInCLuster } from './help-database'

import {createServer, RequestOptions} from 'node:http'
import {conet_Referral_contractV2, masterSetup} from '../util/util'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import {logger} from '../util/logger'
import epochRateABI from '../util/epochRate.json'

import { checkSignObj} from '../util/util'


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

// const startListeningCONET_Holesky_EPOCH = async () => {
// 	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
// 	provideCONET.on('block', async block => {
// 		startTransfer()
// 		return checkBlockEvent (block, provideCONET)
// 	})
// }

const storeToChain = async (data: epochRate) => {
	logger(inspect(data, false, 3, true))
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const wallet = new ethers.Wallet(masterSetup.GuardianReferralsFree, provider)
	const cCNTPContract = new ethers.Contract(epochRateAddr, epochRateABI, wallet)
	let tx
	try {
		tx = await cCNTPContract.updateEpoch(data.totalMiner, data.totalNodes, data.epoch)
	} catch (ex: any) {
		logger(Colors.red(`storeToChain Error! try Again!`), ex.message)
		setTimeout(async () => {
			await storeToChain (data)
		}, 1000)
		
		return
	}
	return logger(Colors.green(`storeToChain ${inspect(data, false, 3, true)} success! tx = [${tx.hash}]`))
}

class conet_mining_server {

	private PORT = masterSetup.PORT||8001

	constructor () {
		this.startServer()
		startListeningCONET_Holesky_EPOCH_v2()
		launshAndDeleteAllWalletInCLuster()
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
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, () => {
			
			return console.table([
                { 'serverMIningV2 ': ` startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
	}

	private router ( router: Router ) {
		
		router.post ('/startMining', async (req, res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /livenessListening message = req.body.message ERROR! ${inspect(req.body, false, 3, true)}`))
				return res.status(404).end()
				
			}
			if (!message||!signMessage||!ipaddress) {
				logger (Colors.grey(`Router /livenessListening !message||!signMessage Error! [${ipaddress}]`))
				return  res.status(404).end()
				
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`[${ipaddress}] to /startMining !obj Error!`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}
			const m: any = await checkMiner(ipaddress, obj.walletAddress)

			// const m = await freeMinerManager(ipaddress, obj.walletAddress)

			if (typeof m === 'number' ) {

				logger(Colors.grey(`${ipaddress}:${obj.walletAddress} /startMining freeMinerManager false!`))
				return res.status(m).end()
			}
			
			res.status(200)
			res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Connection', 'keep-alive')
            res.flushHeaders() // flush the headers to establish SSE with client
			const returnData = addIpaddressToLivenessListeningPool(ipaddress, obj.walletAddress, res)
			res.write(JSON.stringify (returnData)+'\r\n\r\n')	
			
		})

		router.all ('*', (req, res ) =>{
			
			//logger (Colors.grey(`Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_mining_server