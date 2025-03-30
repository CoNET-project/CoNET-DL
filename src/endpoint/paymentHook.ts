import Express, { Router } from 'express'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import { inspect } from 'node:util'
import Stripe from 'stripe'

const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

class conet_dl_server {

	private PORT = 8005
	private serverID = ''
	private endpointSecret = 'whsec_nvfVviJxFmWnj2BlRgJnzSMK2GXvSeKw'
	private stripe = new Stripe(`sk_test_51QztWBHIGHEZ9LgIYTKorf8DtcGKLKINnrjV1MvVjf2NJZRMmZn9smBTSwOJ96GozIGU6ZWEt2A8BqXdTvoPLSm300lZq6DCsc`)
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
					const paymentIntent = event.data.object
					console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
					// Then define and call a method to handle the successful payment intent.
					// handlePaymentIntentSucceeded(paymentIntent);
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
		return paymentIntent.amount === paymentAmount
	} catch (ex: any) {
		return false
	}
}
// new conet_dl_server()

const test = async () => {
	const signature = 't=1743359197,v1=2740b749943af4b041b921bd78f9835005c3a3a0386054ac909ef2c92244c58a,v0=05d67f398f6f46911a3bd4a6ee5472c52c7befb0cd64498c236f327911f57bf1'
	const stripe = new Stripe(`sk_test_51QztWBHIGHEZ9LgIYTKorf8DtcGKLKINnrjV1MvVjf2NJZRMmZn9smBTSwOJ96GozIGU6ZWEt2A8BqXdTvoPLSm300lZq6DCsc`)
	const endpointSecret = 'whsec_nvfVviJxFmWnj2BlRgJnzSMK2GXvSeKw'
	const _body = {
		id: 'evt_3R8QN2HIGHEZ9LgI0khBaDQj',
		object: 'event',
		api_version: '2025-02-24.acacia',
		created: 1743358448,
		data: {
		  object: {
			id: 'pi_3R8QN2HIGHEZ9LgI0iUqCrRk',
			object: 'payment_intent',
			amount: 2000,
			amount_capturable: 0,
			amount_details: { tip: {} },
			amount_received: 2000,
			application: null,
			application_fee_amount: null,
			automatic_payment_methods: null,
			canceled_at: null,
			cancellation_reason: null,
			capture_method: 'automatic_async',
			client_secret: 'pi_3R8QN2HIGHEZ9LgI0iUqCrRk_secret_m8GiD1SOsdzNtyK7CD3rUlUgQ',
			confirmation_method: 'automatic',
			created: 1743358448,
			currency: 'usd',
			customer: null,
			description: '(created by Stripe CLI)',
			invoice: null,
			last_payment_error: null,
			latest_charge: 'ch_3R8QN2HIGHEZ9LgI0xsAEo68',
			livemode: false,
			metadata: {},
			next_action: null,
			on_behalf_of: null,
			payment_method: 'pm_1R8QN2HIGHEZ9LgIzTduaman',
			payment_method_configuration_details: null,
			payment_method_options: { card: [Object] },
			payment_method_types: [ 'card' ],
			processing: null,
			receipt_email: null,
			review: null,
			setup_future_usage: null,
			shipping: {
			  address: [Object],
			  carrier: null,
			  name: 'Jenny Rosen',
			  phone: null,
			  tracking_number: null
			},
			source: null,
			statement_descriptor: null,
			statement_descriptor_suffix: null,
			status: 'succeeded',
			transfer_data: null,
			transfer_group: null
		  }
		},
		livemode: false,
		pending_webhooks: 1,
		request: {
		  id: 'req_8QsVVDCm7dLjlH',
		  idempotency_key: '0b5463a6-cb4c-4545-9c8d-34260c8a7393'
		},
		type: 'payment_intent.succeeded'
	}
	const body = JSON.stringify(_body)
	//const event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
	const isPayment = await searchPayment (stripe, _body.data.object.id, _body.data.object.amount)
	logger(inspect(isPayment, false, 3, true))
}

// test()

//stripe events resend evt_3R85d8HIGHEZ9LgI05yRp4sK --webhook-endpoint=https://hooks.conet.network/api/stripeHook