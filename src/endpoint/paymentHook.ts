import Express, { Router } from 'express'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import { inspect } from 'node:util'
import Stripe from 'stripe'
import { masterSetup} from '../util/util'

const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}


const paymentReference: Map<string, string> = new Map()

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
					
					const pay = await searchPayment(this.stripe, paymentIntent.id, paymentIntent.amount)
					console.log(`PaymentIntent for ${paymentIntent.id} ${paymentIntent.amount} was successful! client_reference_id = ${paymentReference.get(paymentIntent.id)}`)
					break
				}
				
				case 'checkout.session.completed': {
					const session = event.data.object
					const client_reference_id = session.client_reference_id
					const payment_intent = session.payment_intent
					logger(`checkout.session.completed payment_intent = ${payment_intent} client_reference_id = ${client_reference_id}`)
					logger(inspect(session, false, 3, true))
					paymentReference.set(payment_intent, client_reference_id)
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
		

		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}


const searchPayment = async (stripe: Stripe, paymentID: string, paymentAmount: number) => {
	try {
		
		const paymentIntent = await stripe.paymentIntents.retrieve(paymentID)
		logger(inspect(paymentIntent, false, 3, true))
		if (paymentIntent.status !== 'succeeded') {
			return false
		}
		
		return paymentIntent.amount === paymentAmount
	} catch (ex: any) {
		return false
	}
}
new conet_dl_server()

// const test = async () => {

// 	const id = 'pi_3R8jAhHIGHEZ9LgI18MZHccm'//'pi_3R8ReLHIGHEZ9LgI0cd6KDHB'
// 	const stripe = new Stripe(masterSetup.stripe_SecretKey)
// 	const kk = await searchPayment (stripe, id, 249)

// }
// test()