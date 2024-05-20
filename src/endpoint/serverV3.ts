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
import {conet_Referral_contractV2, masterSetup} from '../util/util'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import {logger} from '../util/logger'
const ReferralsMap: Map<string, string> = new Map()
const conet_Holesky_rpc = 'https://rpc.conet.network'

const ReferralsV2Addr = '0x64Cab6D2217c665730e330a78be85a070e4706E7'.toLowerCase()

const checkBlockEvent = async (block: number, provider: ethers.JsonRpcProvider) => {
	const blockDetail = await provider.getBlock(block)
	if (!blockDetail?.transactions) {
		return logger(Colors.gray(`Block ${block} hasn't transactions SKIP!`))
	}

	for (let u of blockDetail.transactions) {
		await detailTransfer(u, provider)
	}

}
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

const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	provideCONET.on('block', async block => {
		return checkBlockEvent (block, provideCONET)

	})
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

		server.listen(this.PORT, '127.0.0.1', () => {
			startListeningCONET_Holesky_EPOCH()
			return console.table([
                { 'CoNET Server V3': ` startup success ${ this.PORT } Work [${workerNumber}]` }
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
			
			return startTransfer()
		})

		router.all ('*', (req, res ) =>{
			
			logger (Colors.grey(`Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

new conet_dl_v3_server()