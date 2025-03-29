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
			if (this.endpointSecret) {
				// Get the signature sent by Stripe
				const signature = req.headers['stripe-signature']
				try {
				  event = this.stripe.webhooks.constructEvent(
					req.body,
					signature,
					this.endpointSecret
				  )
				} catch (err: any) {
				  logger(`⚠️  Webhook signature verification failed.`, err.message)
				  return res.sendStatus(400).end()
				}
			}

			  // Handle the event
			switch (event.type) {
				case 'payment_intent.succeeded': {
					const paymentIntent = event.data.object
					console.log(`PaymentIntent for ${paymentIntent.amount} was successful!`);
					// Then define and call a method to handle the successful payment intent.
					// handlePaymentIntentSucceeded(paymentIntent);
					break
				}
				
				case 'payment_method.attached': {
					const paymentMethod = event.data.object;
					// Then define and call a method to handle the successful attachment of a PaymentMethod.
					// handlePaymentMethodAttached(paymentMethod);
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

new conet_dl_server()