import Express, { Router } from 'express'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import { inspect } from 'node:util'
import Stripe from 'stripe'
import { masterSetup, checkSign} from '../util/util'
import {ethers} from 'ethers'
import web2PaymentABI from './payment_PassportABI.json'
import SP_ABI from './CoNET_DEPIN-mainnet_SP-API.json'
import passport_distributor_ABI from './passport_distributor-ABI.json'

const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

type wallets = {
	walletAddress: string
	solanaWallet: string
}

type walletsProcess = {
	walletAddress: string
	solanaWallet: string
	monthly: boolean
	total: number
	hash: string
}
const paymentReference: Map<string, wallets> = new Map()
const paymentSuccess: Map<string, boolean> = new Map()
const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const web2_wallet = new ethers.Wallet(masterSetup.web2_PaymentPassport, CONET_MAINNET)
const PaymentPassport_addr = '0xD426f38a9162A5E6983b8665A60d9a9c8bde42B6'
const payment_SC = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, web2_wallet)

const Payment_SCPool: ethers.Contract[] = []
Payment_SCPool.push(payment_SC)

const payment_waiting_status: Map<string, number> = new Map()
const payment_waiting_res: Map<string, Response[]> = new Map()
const mintPasswordPool: walletsProcess[]  = []

class conet_dl_server {

	private PORT = 8005
	private stripe = new Stripe(masterSetup.stripe_SecretKey)
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

		router.post('/stripeHook', Express.raw({type: 'application/json'}), async (req: any, res: any) => {
			let event = req.body
			// if (this.endpointSecret) {
			// 	// Get the signature sent by Stripe
			// 	const signature = req.headers['stripe-signature']
			// 	try {
			// 	  event = this.stripe.webhooks.constructEvent(
			// 		req.body,
			// 		signature,
			// 		this.endpointSecret
			// 	  )
			// 	} catch (err: any) {
			// 	  logger(`⚠️  Webhook signature verification failed. ${signature}`, err.message)
			// 	  logger(inspect(req.body, false, 3, true))
			// 	  return res.sendStatus(400).end()
			// 	}
			// }

			  // Handle the event
			switch (event.type) {
				case 'payment_intent.succeeded': {
					const paymentIntent: Stripe.PaymentIntent = event.data.object

					if (!paymentIntent.id) {
						break
					}

					const pay = await searchPayment(this.stripe, paymentIntent.id, paymentIntent.amount)
					if (!pay) {
						break
					}

					const successPay = paymentSuccess.get(paymentIntent.id)
					if (successPay) {
						break
					}

					paymentSuccess.set(paymentIntent.id, true)
					res.status(200).json({received: true}).end()
					const waiting = (): Promise<wallets> => new Promise(resolve => {
						const wallets = paymentReference.get (paymentIntent.id)
						if (!wallets) {
							logger(`PaymentIntent ERROR! no wallets in paymentReference!`)
							return setTimeout (async () => {
								return waiting()
							}, 1000)
						}
						return resolve(wallets)
					})

					const wallets = await waiting ()

					console.log(`PaymentIntent for ${paymentIntent.id} ${paymentIntent.amount} was successful! wallets = ${inspect(wallets, false, 3, true)}`)
					mintPasswordPool.push({
						walletAddress: wallets.walletAddress,
						solanaWallet: wallets.solanaWallet,
						monthly: paymentIntent.amount === 299 ? true: false,
						total: 1,
						hash: paymentIntent.id
					})
					mintPassport()
					break
				}
				
				case 'checkout.session.completed': {
					const session: Stripe.Checkout.Session = event.data.object
					//const client_reference_id = session.client_reference_id
					const payment_intent = session.payment_intent
					const walletAddress = session?.metadata?.walletAddress
					const solanaWallet = session?.metadata?.solanaWallet
					if ( !payment_intent || typeof payment_intent !== 'string' || !walletAddress||!solanaWallet) {
						logger(`checkout.session.completed !payment_intent || !walletAddress||!solanaWallet Error!`)
						break
					}
					paymentReference.set(payment_intent, {walletAddress, solanaWallet})
					break
				}

				

				default: {
					// Unexpected event type
					console.log(`Unhandled event type ${event.type}.`)
				}
				
			}

			// Return a 200 response to acknowledge receipt of the event
			logger(inspect(event, false, 3, true))
			res.status(200).json({received: true}).end()
		})

		router.post('/payment_stripe', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/payment_stripe`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			logger(Colors.magenta(`/PurchaseCONETianPlan`), message, signMessage)
			
			const obj = checkSign (message, signMessage)
			const price = obj?.price
			if (!obj || !obj?.walletAddress||!obj?.solanaWallet|| (price !== 299 && price !== 2499)) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			
			const url = await makePaymentLink(this.stripe, obj.walletAddress, obj.solanaWallet, price)
			payment_waiting_status.set(obj.walletAddress, 1)
			return res.status(200).json({url}).end()
		})

		router.post('/payment_stripe_waiting', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/payment_stripe_waiting`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			logger(Colors.magenta(`/PurchaseCONETianPlan`), message, signMessage)
			
			const obj = checkSign (message, signMessage)
			
			if (!obj || !obj?.walletAddress) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			
			const waiting = payment_waiting_status.get(obj.walletAddress)
			if (!waiting) {
				return res.status(402).json({error: `No ${obj.walletAddress} status`}).end()
			}

			const kk = payment_waiting_res.get(obj.walletAddress)||[]
			kk.push(res)
		})
		
		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}
const ExpiresDays = 1000 * 60 * 60 * 24 * 7

const SP_passport_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'
const passport_distributor_addr = '0x40d64D88A86D6efb721042225B812379dc97bc89'
const SP_Passport_SC_readonly = new ethers.Contract(SP_passport_addr, SP_ABI, CONET_MAINNET)
const SPManagermentcodeToClient= new ethers.Contract(passport_distributor_addr, passport_distributor_ABI, web2_wallet)
const getNextNft = async (wallet: string, userInfo: [nfts:BigInt[], expires: BigInt[], expiresDays: BigInt[], premium:boolean[]]) => {

	for (let i = 0; i < userInfo[0].length; i ++) {
		const nft = parseInt(userInfo[0][i].toString())
		if (nft === 0) {
			continue
		}
		const expiresDay = parseInt(userInfo[2][i].toString())
		const _expires = parseInt(userInfo[1][i].toString())
		if (typeof _expires !== 'number') {
			return nft
		}
		const now = new Date().getTime()
		const expires = new Date(_expires*1000).getTime()
		if (Math.abs(now - expires) < ExpiresDays || expiresDay < 30) {
			continue
		}
		try {
			const _owner: bigint = await SP_Passport_SC_readonly.balanceOf(wallet, nft)
			const owner = parseInt(_owner.toString())
			if (owner > 0) {
				return nft
			}
		} catch (ex) {
			continue
		}
		return nft
	}
	return -1

}

const finishListening = (wallet: string, currentID: number) => {
	payment_waiting_status.delete (wallet)
	const res = payment_waiting_res.get (wallet)
	if (res?.length) {
		for (let i of res) {
			if (i.writable) {
				i.status(200).json({currentID}).end()
			}
			
		}
	}
	payment_waiting_res.delete(wallet)
}

const mintPassport = async () => {
	const obj = mintPasswordPool.shift()
	if (!obj) {
		return
	}
	const SC = Payment_SCPool.shift()
	if (!SC) {
		mintPasswordPool.unshift(obj)
		return
	}
	try {
		const isHash = await SC.getPayID(obj.hash)
		if (isHash) {
			Payment_SCPool.push(SC)
			return mintPassport()
		}
		logger(`mintPassport ${obj.walletAddress} ${obj.hash}`)
		const ts = await SC.mintPassport(obj.walletAddress, obj.monthly ? 31 : 365, obj.hash)
		await ts.wait()

		const [currentNFT, userInfo] = await Promise.all([
			SPManagermentcodeToClient.getCurrentPassport(obj.walletAddress),
			SPManagermentcodeToClient.getUserInfo(obj.walletAddress)
		])

		const currentID = parseInt(currentNFT[0])
		const _currentExpires = parseInt(currentNFT[1].toString())

		//		
		if (typeof _currentExpires !== 'number') {
			finishListening(obj.walletAddress, currentID)
			return
		}

		const nftID = await getNextNft(obj.walletAddress, userInfo)
		if (nftID === currentID || nftID < 0) {
			finishListening(obj.walletAddress, currentID)
			return 
		}
		const tx = await SPManagermentcodeToClient._changeActiveNFT(obj.walletAddress, nftID)
		await tx.wait()
		finishListening(obj.walletAddress, currentID)
	} catch (ex) {
		logger(`mintPassport Error!`)
	}
	Payment_SCPool.push(SC)
	return mintPassport()
}

const makePaymentLink = async (stripe: Stripe,  walletAddress: string, solanaWallet: string, price: number) => {
	const option: Stripe.PaymentLinkCreateParams = {
		line_items: [{
			price: price === 299 ? 'price_1R8o0cHIGHEZ9LgI1wJPFVPZ': 'price_1R8p8lHIGHEZ9LgIWBJYbUgl',
			quantity: 1
		}],
		metadata:{walletAddress,solanaWallet}
	}
	const paymentIntent = await stripe.paymentLinks.create(option)
	logger(inspect(paymentIntent, false, 3, true))
	return paymentIntent.url
}

const searchPayment = async (stripe: Stripe, paymentID: string, paymentAmount: number) => {
	try {
		
		const paymentIntent = await stripe.paymentIntents.retrieve(paymentID)
		if (paymentIntent.status !== 'succeeded') {
			return false
		}
		return paymentIntent.amount === paymentAmount
	} catch (ex: any) {
		return false
	}
}
new conet_dl_server()

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/payment_stripe