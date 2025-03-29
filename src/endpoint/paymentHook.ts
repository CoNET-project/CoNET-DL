import Express, { Router } from 'express'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import { inspect } from 'node:util'

const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

class conet_dl_server {

	private PORT = 8004
	private serverID = ''


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

		router.post('/stripeHook',async (req: any, res: any) => {
			logger(inspect(req.body, false, 3, true))
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