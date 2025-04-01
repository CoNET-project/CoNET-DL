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
const paymentReference: Map<string, wallets> = new Map()
const paymentSuccess: Map<string, boolean> = new Map()
const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const web2_wallet = new ethers.Wallet(masterSetup.web2_PaymentPassport, CONET_MAINNET)
const PaymentPassport_addr = '0xD426f38a9162A5E6983b8665A60d9a9c8bde42B6'
const payment_SC = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, web2_wallet)

const Payment_SCPool: ethers.Contract[] = []
Payment_SCPool.push(payment_SC)



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
		app.use(Cors ())
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
						return
					}

					const pay = await searchPayment(this.stripe, paymentIntent.id, paymentIntent.amount)
					if (!pay) {
						return
					}

					const successPay = paymentSuccess.get(paymentIntent.id)
					if (successPay) {
						return
					}

					paymentSuccess.set(paymentIntent.id, true)
					const wallets = paymentReference.get (paymentIntent.id)
					console.log(`PaymentIntent for ${paymentIntent.id} ${paymentIntent.amount} was successful! wallets = ${inspect(wallets, false, 3, true)}`)
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

		router.post('/payment_stripe',async (req: any, res: any) => {
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
			return res.status(200).json({url}).end()
		})
		

		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
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

