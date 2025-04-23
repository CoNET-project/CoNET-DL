/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { logger, checkSign, newCNTP_Contract, getServerIPV4Address, conet_cancun_rpc, checkClaimeToeknbalance, masterSetup} from '../util/util'

import CNTPAbi from '../util/cCNTP.json'
import {ethers} from 'ethers'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {cntpAdminWallet, GuardianPurchase, GuardianPurchasePool, CONETianPlanPurchase, christmas2024} from './utilNew'
import {createServer} from 'node:http'
import {watch} from 'node:fs'
import referralsV3ABI from './ReferralsV3.json'
import SPClub_ABI from './SP_Club_ABI.json'
import SPPassportABI from './SPPassportABI.json'
import passport_distributor_ABI from './passport_distributor-ABI.json'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`



const mainnetEndpoint = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const provider = new ethers.JsonRpcProvider(conet_cancun_rpc)

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
	totalUsers: number
}

const referralsV3_addr = '0x1b104BCBa6870D518bC57B5AF97904fBD1030681'
const referralsV3_Contract = new ethers.Contract(referralsV3_addr, referralsV3ABI, provider)

const getreferralsCount = async (addr: string, _res: Response) => {
	try {
		const kk = await referralsV3_Contract.getReferees(addr)
		return _res.status(200).json({totalWallets: kk.length}).end()
	} catch (ex: any) {
		logger(`getreferralsCount ERROR! ${ex.message}`)
		return _res.status(503).end()
	}
}

let eposh_total:epochRate|null = null

const filePath = '/home/peter/.data/v2/'
const epochPath = '/api/epoch'

const get_epoch_total = async () => {

	getLocalhostData(epochPath, {}, data => {
		if (!data) {
			return logger(`get_epoch_total Error, data null!`)
		}
		
		eposh_total = data
	})


	// const block = currentEpoch - 3
	// const filename1 = `${filePath}current.total`
	
	// try {
	// 	const data = await readFile(filename1, 'utf8')
		
	// 	const ratedata: epochRate = JSON.parse(data)
	// 	eposh_total = ratedata
		
	// } catch (ex: any) {
	// 	eposh_total = {totalMiners: 0, minerRate: 0, totalUsers: 0}
	// 	logger(Colors.red(`get_epoch_total ${filename1} Error!`), ex.message)
	// }
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

const getLocalhostData = async (path: string, obj: any, callback: (data: any) => void)=> {
	
	const option: RequestOptions = {
		hostname: 'localhost',
		path,
		port: 8004,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		if (res.statusCode!=200) {
			logger(`getLocalhostData res != 200 Error!`)
			return callback(null)
		}
		let data = ''
		res.on('data', _data => {
			data += _data.toString()
		})
		res.once('end', () => {
			try {
				const ret = JSON.parse(data)
				callback(ret)
			} catch (ex) {
				logger(`getLocalhostData JSON parse Error!`)
				logger(inspect(data))
				return callback(null)
			}

		})
		
		
	})

	req.once('error', (e) => {
		console.error(`postLocalhost ${path} to master on Error! ${e.message}`)
	})

	req.write(JSON.stringify(obj))
	req.end()
}

const postLocalhost = async (path: string, obj: any, _res: Response)=> {
	
	const option: RequestOptions = {
		hostname: 'localhost',
		path,
		port: 8003,
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
			_res.status(503).json({error: "Server isn't available Error!"}).end()
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
				setTimeout(async () => {
					await get_epoch_total()
				}, 1000)
				
			}
			
		}
	})
	
	currentEpoch = await provider.getBlockNumber()
	await get_epoch_total()
}

const MaxCount = 1

const fx168_Referrer = '0xd57cA74229fd96A5CB9e99DFdfd9de79940FD61D'.toLowerCase()

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

	private PORT = 8084
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
				logger(Colors.magenta(`!/apiv3\.conet\.network/i.test(${head}) Error`))
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
				const _count = count.sort((a,b) => b-a).filter(v => v > timeStamp - 1000)
				const newCount = _count.slice(0, 10)
				countAccessPool.set(ipaddress, newCount)
				if (_count.length > MaxCount) {
					//logger(`${ipaddress} _count.length ${_count.length} > MaxCount ${MaxCount} => ${req.method} return 503!!!!!!!!`)
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
			//logger (Colors.grey(`Router /conet-faucet to [${ ipaddress }]`))
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
			return postLocalhost('/api/initV3', {wallet: wallet.toLowerCase()}, res)
			
		})

		router.get('/miningRate', async (req: any, res: any) => {

			const query = req.query
			const epoch = currentEpoch
			
			return res.status(200).json(eposh_total).end()
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

		router.post('/spclub', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/spclub`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /spclub req.body ERROR!`), inspect(req.body))
				return res.status(404).json({
					error: 'message & signMessage Object Error!'
				}).end()
			}

			logger(Colors.magenta(`/spclub`), message, signMessage)
			const obj = checkSign (message, signMessage)
	
			if (!obj || !obj?.walletAddress || !obj?.solanaWallet ) {
				logger (Colors.grey(`Router /spclub checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
				logger(inspect(obj, false, 3, true))

				return res.status(403).json({
					error: 'message & signMessage Object walletAddress or solanaWallet Error!'
				}).end()
			}

			const check = await proCheckSPClubMember (obj)
			logger(`check = await proCheckSPClubMember (obj) == ${check}`)
			if (check === null) {
				
				return res.status(403).json({
					error: 'Service temporarily unavailable'
				}).end()
			}

			if (check === false) {
				obj.referrer = obj.referrer||'0x0000000000000000000000000000000000000000'
				try {
					obj.referrer = ethers.getAddress(obj.referrer)
				} catch(ex) {
					return res.status(403).json({
						error: 'referrer address Error!'
					}).end()
				}
				logger(Colors.blue(`/api/spclub POST to local master!`))
				return postLocalhost('/api/spclub', obj, res)
			}

			if (check === true) {
				return res.status(403).json({
					error: 'You have no valid Silent Pass Passport'
				}).end()
			}

			if (check > 0) {
				return res.status(403).json({
					error: `You are already membership ${check}`
				}).end()
			}

		})

		router.post ('/fx168HappyNewYear', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/fx169HappyNewYear`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /fx169HappyNewYear req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			logger(Colors.magenta(`/fx168HappyNewYear`), message, signMessage)
			const obj = checkSign (message, signMessage)
	
			if ( !obj?.walletAddress ) {
				logger (Colors.grey(`Router /fx169HappyNewYear checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
				logger(inspect(obj, false, 3, true))
				return res.status(404).json(req.body).end()
			}

			getReferrer(obj.walletAddress, (err, data) => {
				if (err) {
					return res.status(503).json({error: "Server isn't available Error"})
				}
				if ( !data?.address || data.address === '0x0000000000000000000000000000000000000000'|| data.address?.toLowerCase() !== fx168_Referrer ) {
					return res.status(403).json({error: "user wallet has not Fx168 referrer Error!"})
				}

				postLocalhost('/api/fx168HappyNewYear', {wallet: obj.walletAddress.toLowerCase()}, res)
			})
		})

		// router.post ('/getTestNFTs', async (req: any, res: any) => {
		// 	const ipaddress = getIpAddressFromForwardHeader(req)
		// 	let message, signMessage
		// 	try {
		// 		message = req.body.message
		// 		signMessage = req.body.signMessage

		// 	} catch (ex) {
		// 		logger (Colors.grey(`${ipaddress} request /getTestNFTs req.body ERROR!`), inspect(req.body))
		// 		return res.status(404).end()
		// 	}
		// 	logger(Colors.magenta(`/getTestNFTs`))
		// 	const obj = checkSign (message, signMessage)
	
		// 	if ( !obj?.walletAddress ) {
		// 		logger (Colors.grey(`Router /getTestNFTs checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
		// 		logger(inspect(obj, false, 3, true))
		// 		return res.status(404).json({
		// 			error: "SignObj Error!"
		// 		}).end()
		// 	}
		// 	return createTestNft(obj, res)

		// })

		// router.post ('/getTestNFTsNew', async (req: any, res: any) => {
		// 	const ipaddress = getIpAddressFromForwardHeader(req)
		// 	let message, signMessage
		// 	try {
		// 		message = req.body.message
		// 		signMessage = req.body.signMessage

		// 	} catch (ex) {
		// 		logger (Colors.grey(`${ipaddress} request /getTestNFTsNew req.body ERROR!`), inspect(req.body))
		// 		return res.status(404).end()
		// 	}
		// 	logger(Colors.magenta(`/getTestNFTsNew`))
		// 	const obj = checkSign (message, signMessage)
	
		// 	if ( !obj?.walletAddress ) {
		// 		logger (Colors.grey(`Router /getTestNFTsNew checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
		// 		logger(inspect(obj, false, 3, true))
		// 		return res.status(404).json({
		// 			error: "SignObj Error!"
		// 		}).end()
		// 	}
		// 	return createTestNft_new(obj, res)

		// })

		router.post('/freePassport', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /freePassport req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			
			const obj = checkSign (message, signMessage)
			if ( !obj?.walletAddress ) {
				logger (Colors.grey(`Router /freePassport checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
				logger(inspect(obj, false, 3, true))
				return res.status(404).json({
					error: "SignObj Error!"
				}).end()
			}
			const result = await checkFreePassport(obj?.walletAddress)
			if (result === null) {
				return res.status(403).json({
					error: "system Error!"
				}).end()
			}
			if (result) {
				return res.status(404).json({
					error: "Already finished!"
				}).end()
			}
			return postLocalhost('/api/freePassport', obj, res)
		})

		router.post('/codeToClient', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /freePassport req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			
			const obj = checkSign (message, signMessage)
			if ( !obj?.walletAddress|| !obj?.uuid || !obj?.solanaWallet) {
				
				logger (Colors.grey(`Router /freePassport checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
				logger(inspect(obj, false, 3, true))
				return res.status(404).json({
					error: "SignObj Error!"
				}).end()
			}
			const _hash = ethers.solidityPacked(['string'], [obj.uuid])
			obj.hash = ethers.zeroPadBytes(_hash, 32)
			return postLocalhost('/api/codeToClient', obj, res)
		})

		router.post ('/claimToken', async (req: any, res: any) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /claimToken req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			const response = await claimeToekn (message, signMessage)
			if (response) {
				return res.status(200).json({}).end()
			}
			return res.status(403).end()

		})

		router.post ('/applePay', async (req: any, res: any) => {
			logger(`/applePay`)
			logger(inspect(req.body, false, 3, true))
			return res.status(200).json({"success": true}).end()
		})
		
		router.all ('*', (req: any, res: any) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			//logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}


const getReferrer = async (address: string, callbak: (err: Error|null, data?: any) => void)=> {
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/wallet`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		wallet: address
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak (null, ret)
			} catch (ex: any) {
				console.error(`getReferrer /api/wallet getReferrer JSON.parse(data) Error!`, data)
				return callbak (ex)
			}
			
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (e)
	})

	req.write(JSON.stringify(postData))
	req.end()
}
const CoNETDePIN_PassportSC_cancun_addr = '0xb889F14b557C2dB610f283055A988952953E0E94'
const CoNETDePIN_PassportSC_mainnet_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'
const PassportSC_cancun_readonly = new ethers.Contract(CoNETDePIN_PassportSC_cancun_addr, SPPassportABI, provider)
const PassportSC_mainnet_readonly = new ethers.Contract(CoNETDePIN_PassportSC_mainnet_addr, SPPassportABI, mainnetEndpoint)


const _checkNFT_expires = (nftObj: any[]) => {
	let _nftIDs: ethers.BigNumberish
	let _expires: ethers.BigNumberish
	let _expiresDays: ethers.BigNumberish
	let _premium: boolean
	[_nftIDs, _expires, _expiresDays, _premium] = nftObj
	logger(inspect(nftObj, false, 3, true))
	const today = parseFloat(new Date().getTime().toString())

	const expires =  parseFloat(_expires.toString()) * 1000			//		Convert to milliseconds

	if (!_nftIDs|| expires < today) {
		return false
	}
	return true
}
const SPClub_SC_addr = `0xe1949263B338D8c1eD7d4CbDE2026eb82DB78D3a`
const SPClub_SC_readonly = new ethers.Contract(SPClub_SC_addr, SPClub_ABI, mainnetEndpoint)
const proCheckSPClubMember = async (obj: minerObj) => {
	try {
		
		const [mainnet, _memberID] = await Promise.all([
			PassportSC_mainnet_readonly.getCurrentPassport(obj.walletAddress),
			SPClub_SC_readonly.membership(obj.walletAddress)
		])
		const memberID: number = parseInt (_memberID.toString())
		if (memberID > 0) {
			return memberID
		}

		const nftmainnet = await _checkNFT_expires(mainnet)

		if (nftmainnet) {
			return false
		}
		
	} catch (ex) {
		logger(Colors.red(`proCheckSPClub got Error!`))
		return null
	}
	return true
}

const passport_distributor_addr = '0x147385a07Cf222Aee0e7FAe0746fed7a4d45C740'
const passport_distributor_manager = new ethers.Wallet (masterSetup.distributor, provider)
const passport_distributor_SC = new ethers.Contract(passport_distributor_addr, passport_distributor_ABI, passport_distributor_manager)

const passport_distributor_addr_mainnet = '0x40d64D88A86D6efb721042225B812379dc97bc89'
const passport_distributor_manager1 = new ethers.Wallet (masterSetup.distributor, mainnetEndpoint)
const passport_distributor_SC1 = new ethers.Contract(passport_distributor_addr_mainnet, passport_distributor_ABI, passport_distributor_manager1)

const createNFTs1 = async (wallet: string) => {
	let tx
	try {
		tx = await passport_distributor_SC1.betchMintToDistributor(wallet, 1, true)
		await tx.wait()
		const ts = await passport_distributor_SC1.betchMintToDistributor(wallet, 1, false)
		await ts.wait()
		
	} catch (ex: any) {
		logger(`createTestNft Error! ${ex.message}`)
		return false
	}
	logger(`createNFTs tx = ${tx.hash}`)
	return tx.hash
}

const createNFTs = async (wallet: string) => {
	let tx
	try {
		tx = await passport_distributor_SC.betchMintToDistributor(wallet, 10, true)
		await tx.wait()
		const ts = await passport_distributor_SC.betchMintToDistributor(wallet, 10, false)
		await ts.wait()
		
	} catch (ex: any) {
		logger(`createTestNft Error! ${ex.message}`)
		return false
	}
	logger(`createNFTs tx = ${tx.hash}`)
	return tx.hash
}

const createTestNft = async (obj: minerObj, res: any) => {
	const tx = await createNFTs(obj.walletAddress)
	if (!tx) {
		return res.status(403).json({
			error: 'API system error, please contact CONET team'
		}).end()
	}
	return res.status(200).json({
		success: tx
	}).end()
}

const createTestNft_new = async (obj: minerObj, res: any) => {
	const tx = await createNFTs1(obj.walletAddress)
	if (!tx) {
		return res.status(403).json({
			error: 'API system error, please contact CONET team'
		}).end()
	}
	return res.status(200).json({
		success: tx
	}).end()
}

const checkFreePassport = async (wallet: string) => {
	try {
		const freeUser = await passport_distributor_SC1._freeUserOwnerShip(wallet)
		return freeUser
	} catch (ex: any) {
		return null
	}
}

export default conet_dl_server_v4
