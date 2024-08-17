import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import { readFile, createReadStream, stat} from 'node:fs'
import {getIpAddressFromForwardHeader} from './help-database'
import { inspect } from 'node:util'
import { checkSignObj} from '../util/util'
import type { RequestOptions,ServerResponse } from 'node:http'
import {request} from 'node:http'
import Cluster from 'node:cluster'
import {writeFile} from 'node:fs'

const storagePath = ['/home/peter/FragmentIPFS/FragmentIPFS1', '/home/peter/FragmentIPFS/FragmentIPFS2', '/home/peter/FragmentIPFS/FragmentIPFS3']

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`


const saveFragment = (hashName: string, data: string) => new Promise(resolve=> {
	const lastChar = hashName[hashName.length-1]
	const n = parseInt(`0x${lastChar}`, 16)
	const path = storagePath[n%storagePath.length]
	const fileName = `${path}/${hashName}`
	logger(`saveFragment [${fileName}] data length = ${data.length}`)

	return writeFile(fileName, data, err => {
		if (err) {
			logger(Colors.red(`saveFragment [${hashName}] data length [${data.length}] Error! ${err.message}`))
			return resolve (false)
		}
		logger(`saveFragment storage [${fileName}] data length = ${data.length} success!`)
		return resolve (true)
	})
})

const getFragment = async (hashName: string, res: Response) => {
	const lastChar = hashName[hashName.length-1]
	const n = parseInt(`0x${lastChar}`, 16)
	const path = storagePath[n%storagePath.length]
	const filename = `${path}/${hashName}`
	return stat(filename, err => {
		if (err) {
			logger(Colors.red(`getFragment file [${filename}] does not exist!`))
			return res.status(404).end()
		}

		const req = createReadStream(filename, 'utf8')
		res.status(200)

		req.pipe(res).on(`error`, err => {
			logger(Colors.red(`getFragment on error ${err.message}`))
		})
	})
	

}

class server {

	private PORT = 3000
	public ipaddressWallet: Map<string, string> = new Map()
	public WalletIpaddress: Map<string, string> = new Map()
	public regiestNodes: Map<string, string> = new Map()
	public nodeIpaddressWallets: Map<string, Map<string, string>> = new Map()
	constructor () {
		this.startServer()
    }

	private startServer = async () => {
		const Cors = require('cors')
		const app = Express()
		app.use(Express.json({ limit: '50mb' }))
		app.use(Express.urlencoded({ extended: true }))
		app.disable('x-powered-by')
		app.use( Cors ())
		app.use(Express.urlencoded({ extended: false }));
		const router = Router ()
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
			res.status(406).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, 'localhost', () => {
			return console.table([
                { 'Cluster': ` startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
	}

	private router ( router: Router ) {
		
		router.post ('/storageFragment',  async (req, res) => {
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(403).end()
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj || !obj?.data || !obj?.hash) {
				logger (Colors.grey(`Router /storageFragments !obj Format Error Error! ${ipaddress} hash ${obj?.hash} data length [${obj?.data?.length}]`))
				return res.status(403).end()
			}
			logger(Colors.blue (`/storageFragment from ${ipaddress} ${obj.hash}`))

			const result = await saveFragment(obj.hash, obj.data)

			if (result) {
				return res.status(200).json({status:true}).end()
			}

			return res.status(403).json({status:true}).end()

		})

		router.get (/\/getFragment\//,  async (req, res) => {
			

			const _hashName = req.path.split('getFragment/')
			if (_hashName.length < 2) {
				logger(Colors.blue(`/getFragment unknow path ${req.path}`))
				return res.status(404).end()
			}
			return getFragment (_hashName[1], res)
		})


		router.all ('*', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`[${ipaddress}] => Router /api get unknow router [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(410).end()
			return res.socket?.end().destroy()
		})
	}
}

export default server


//	curl -v https://ipfs.conet.network/api/getFragment/free_wallets_53152
//	curl -v https://ipfs.conet.network/api/getFragment/53408_free