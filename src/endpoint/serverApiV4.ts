/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { logger, checkSign, newCNTP_Contract, getServerIPV4Address, conet_Holesky_rpc, checkClaimeToeknbalance} from '../util/util'
import {ticket_contract} from './serverApiV3Master'
import CNTPAbi from '../util/cCNTP.json'
import {ethers} from 'ethers'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet, GuardianPurchase, GuardianPurchasePool, CONETianPlanPurchase} from './utilNew'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {watch} from 'node:fs'
import {getDailyIPAddressAndhashCheck} from '../util/dailyTaskChangeHash'
import referralsV3ABI from './ReferralsV3.json'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)

//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {

	// logger(inspect(req.headers, false, 3, true))
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]||req.headers['X-Forwarded-For'.toLowerCase()]||req.headers['CF-Connecting-IP'.toLowerCase()]||req.ip
	if (!ipaddress) {
		return ''
	}
	if (typeof ipaddress === 'object') {
		return ipaddress[0]
	}
	return ipaddress
}

interface epochRate {
	totalMiners: number
	minerRate: number
}

const referralsV3_addr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const referralsV3_Contract = new ethers.Contract(referralsV3_addr, referralsV3ABI, provider)

const getreferralsCount = async (addr: string, _res: Response) => {
	try {
		const kk = await referralsV3_Contract.getReferees(addr)
		return _res.status(200).json({totalWallets: kk.length}).end()
	} catch (ex) {
		return _res.status(503).end()
	}
}

const eposh_total: Map<number, epochRate> = new Map()

const filePath = '/home/peter/.data/v2/'

const get_epoch_total = async () => {
	const block = currentEpoch - 2
	const filename1 = `${filePath}${block}.total`
	
	try {
		const data = await readFile(filename1, 'utf8')
		logger(inspect(data, false, 3, true))
		const ratedata = JSON.parse(data)
		eposh_total.set(block, ratedata)
		eposh_total.delete(block - 4)
	} catch (ex: any) {
		eposh_total.set(block, {totalMiners: 0, minerRate: 0})
		logger(Colors.red(`get_epoch_total ${filename1} Error!`), ex.message)
	}
}


const unlockCNTP = async (wallet: string, privateKey: string) => {

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
		port: 8002,
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

let currentEpoch = 0

const listenEpoch = async () => {

	watch(filePath, async (eventType, _filename) => {
		const filename = _filename||''
		
		if (/\.total$/.test(filename)) {
			const epoch = parseInt(filename.split('.')[0]) + 1
			if (epoch > currentEpoch) {
				currentEpoch = epoch
				await get_epoch_total()
			}
			
		}
	})
	
	currentEpoch = await provider.getBlockNumber()
	await get_epoch_total()
}

const MaxCount = 1

const checkTicket = async (wallet: string) => {
	const [isApproved, balance ] = await Promise.all([
		ticket_contract.isApprovedForAll(wallet, '0x068759bCfd929fb17258aF372c30eE6CD277B872'),
		ticket_contract.balanceOf(wallet, 1)
	])
	logger(Colors.blue (`checkTicket account ${wallet} isApproved = ${isApproved} balance = ${balance}`))
	if (isApproved && balance.toString() > '0') {

		return true
	}
	return false
}

export const claimeToekn = async (message: string, signMessage: string ) => {
	const obj = checkSign (message, signMessage)
	if (!obj || !obj?.data) {
		logger(Colors.red(`claimeToekn obj Error!`), `\nmessage=[${message}]\nsignMessage=[${signMessage}]`)
		return false
	}
	logger(Colors.blue(`claimeToekn message=[${message}]`))
	logger(Colors.blue(`claimeToekn signMessage=[${signMessage}]`))
	const data = obj.data
	if (!data?.tokenName) {
		logger(Colors.red(`claimeToekn hasn't data.tokenName Error!`), `\nmessage=[${message}]\nsignMessage=[${signMessage}]`)
		return false
	}
	logger(inspect(obj, false, 3, true))
	
	return await checkClaimeToeknbalance(obj.walletAddress, data.tokenName)
}


const countAccessPool: Map<string, number[]> = new Map()
class conet_dl_server_v4 {

	private PORT = 80
	private appsPath = ''
	private serverID = ''

	private initSetupData = async () => {

        logger (Colors.blue(`start local server!`))
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		listenEpoch()
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
    }

	private startServer = async () => {
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use (async (req: any, res: any, next) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			
			if (!ipaddress) {
				logger(Colors.red(`clinet has not IP address error!`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			const head = req.headers['host']
			
			if (!head || !/apiv4\.conet\.network/i.test(head)) {
				logger(Colors.magenta(`!/apiv3\.conet\.network/i.test(head) Error`))
				logger(inspect(req.headers, false, 3, true))
				res.status(404).end()
				return res.socket?.end().destroy()
			}
			
			const timeStamp = new Date().getTime()
			const count = countAccessPool.get(ipaddress)
			if (!count)	{
				countAccessPool.set(ipaddress, [timeStamp])
			} else {
				count.push(timeStamp)
				const _count = count.sort((a,b) => b-a).filter(v => v > timeStamp -1000)
				if (_count.length > MaxCount) {
					logger(`${ipaddress} _count.length ${_count.length} > MaxCount ${MaxCount} => ${req.method} return 503!!!!!!!!`)
					res.status(503).end()
					return res.socket?.end().destroy()
				}
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

		app.all ('*', (req: any, res: any) => {
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
		
		router.get ('/health', async (req: any, res: any) => {
			if (res.writable && !res.writableEnded) {
				res.json ({ health: true }).end()
			}
			return res.socket?.end().destroy()

		})

		//********************			V2    		****** */		

		router.post ('/conet-faucet', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /conet-faucet to [${ ipaddress }]`))
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
			
			return postLocalhost('/api/conet-faucet', {walletAddress: wallet_add, ipaddress}, res)

		})

		router.post ('/Purchase-Guardian', async (req: any, res: any) => {
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/Purchase-Guardian`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			logger(Colors.magenta(`/Purchase-Guardian`), message, signMessage)
			GuardianPurchasePool.push({
				message,
				signMessage,
				ipaddress,
				res
			})

			GuardianPurchase()
			
		})

		router.post ('/initV3',  async (req: any, res: any) => {

			const _wallet: string = req.body.walletAddress
			let wallet: string 
			try {
				wallet = ethers.getAddress(_wallet)
			} catch (ex) {
				return res.status(403).end()
			}
			logger(`/initV3`)
			return postLocalhost('/api/initV3', {wallet: wallet.toLowerCase()}, res)
			
		})

		router.get('/miningRate', async (req: any, res: any) => {

			const query = req.query
			const epoch = typeof query?.eposh === 'string' ? parseInt(query.eposh) : currentEpoch
			let obj = eposh_total.get(epoch)||eposh_total.get(epoch-1)||{}
			return res.status(200).json(obj).end()
		})

		router.post ('/PurchaseCONETianPlan', async (req: any, res: any) => {
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/PurchaseCONETianPlan`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			logger(Colors.magenta(`/PurchaseCONETianPlan`), message, signMessage)
			const obj = checkSign (message, signMessage)
	
			if (!obj || !obj?.data ) {
				logger (Colors.grey(`Router /PurchaseCONETianPlan checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
				logger(inspect(obj, false, 3, true))

				return res.status(403).json(req.body).end()
			}
			
			const result = await CONETianPlanPurchase(obj)
			if (!result) {
				return res.status(403).json(req.body).end()
			}
			return res.status(200).json({}).end()
		})

		router.get ('/totalReferrals', async (req: any, res: any) => {
			const addr = req.query?.addr||null
			if (!addr) {
				return res.status(404).end()
			}
			return getreferralsCount(addr, res)
		})

		router.post ('/claimToken', async (req: any, res: any) => {

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
		
		router.all ('*', (req: any, res: any) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server_v4



const testCleam = () => {
	const data = {
		"message": "{\"walletAddress\":\"0x69237C9B639577d5F8A2A8970B76A92fCbeE3C34\",\"data\":{\"tokenName\":\"cBNB\"}}",
		"signMessage": "0x3aa33126541256cb55a215473afa1c56a4b3ec02cff48ee19d396c7e45ab7bb21eb452ec5cbc502a57ed745376e09b321bcccfe2c508156e9cbd3ce24a437fc71b"
	}

	claimeToekn(data.message, data.signMessage)
	
}


testCleam()

//		curl -v "https://apiv4.conet.network/api/totalReferrals?addr=0xd57cA74229fd96A5CB9e99DFdfd9de79940FD61D"