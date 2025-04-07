import {ethers} from 'ethers'
import {RequestOptions, request} from 'node:https'
import {inspect} from 'node:util'
import Express, { Router } from 'express'
import {logger} from './logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import {checkSign} from '../util/util'

const conetAPIServerURL = `https://apiv4.conet.network/api/`

//		168 公鑰
const fx168PublicKey = 'public key'.toLowerCase()



const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

const payment_waiting_status: Map<string, number> = new Map()

const postToServer = (url: string, obj: any) => new Promise(async resolve => {
	const Url = new URL (url)
	const option: RequestOptions = {
		hostname: Url.hostname,
		path: Url.pathname,
		port: 443,
		method: 'POST',
		protocol: 'https:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		let body = ''
		res.on('data', _data => {
			body += _data.toString()
		})


		res.on('end', () => {
			try {
				const ret = JSON.parse(body)
				return resolve (ret)
			} catch (ex) {
				return resolve(false)
			}
		})

		res.once('error', err => {
			resolve(false)
		})
		
	})

	req.once('error', (e) => {
		resolve(false)
	})

	req.write(JSON.stringify(obj))
	req.end()
})

const conetAPI = async (privateKey: string, path: string, portObject: Record<string, any>) => {
	//		使用私鑰創建錢包
	const wallet = new ethers.Wallet(privateKey)

	//		把簽名的公鑰放入JSON
	portObject.walletAddress = wallet.address

	//		轉換送出的JSON為字符串
	const message = JSON.stringify(portObject)

	//		簽名送出的字符串
	const signMessage = wallet.signMessage(message)

	//		製作送POST 數據
	const postDate = {message, signMessage}

	//		API URL
	const apiUrl = `conetAPIServerURL${path}`

	const result = await postToServer(apiUrl, postDate)

	if (!result) {
		return console.log(`conetAPI error!`)
	}

	console.log(`conetAPI ${inspect(portObject, false, 3, true)} SUCCESS!`)

}

class conet_dl_server {

	private PORT = 8000
	private initSetupData = async () => {
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
		// app.use(Cors ())
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
			return console.table([
				{ 'CoNET paymentHook': `started success ${ this.PORT }` }
			])
		})
	}

	private router ( router: Router ) {

		router.post('/paypal_fx168', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)

			//		body === { message, signMessage}
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /payment_stripe_waiting req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			//		
			const obj = checkSign (message, signMessage)

			//		obj === {walletAddress: '168 public key', data {walletAddress: 'client public KEY', solanaWallet: 'client solana public key'}}
			if (!obj || obj?.walletAddress !== fx168PublicKey || !obj?.data?.walletAddress || obj?.data?.solanaWallet) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}

			//	發行NFT 進程
			//	

			res.status(200).json({success: true})

		})

		router.post('/payment_stripe_waiting', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /payment_stripe_waiting req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			
			const obj = checkSign (message, signMessage)
			
			if (!obj || !obj?.walletAddress) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			
			const status = payment_waiting_status.get(obj.walletAddress)
			if (!status) {
				logger(`/payment_stripe_waiting ${obj.walletAddress} got unknow status! ${status}`)
				return res.status(402).json({error: `No ${obj.walletAddress} status`}).end()
			}
			logger(`/payment_stripe_waiting ${obj.walletAddress} got ${status}`)
			return res.status(200).json({ status }).end()
		})

		
		
		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

new conet_dl_server()