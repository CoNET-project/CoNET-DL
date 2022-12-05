/**
 * 			
 * */
import Express, { Router } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register, regiestFaucet, getLast5Price, exchangeUSDC, mint_conetcash, conetcash_getBalance, CoNET_SI_health, getSI_nodes } from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import Web3 from 'web3'
import { readFileSync } from 'node:fs'
import { logger, loadWalletAddress, getSetup, return404, decryptPayload, s3fsPasswd } from '../util/util'
import { createServer} from 'node:https'
import type { ServerOptions } from 'node:https'
import Cluster from 'node:cluster'


const splitIpAddr = (ipaddress: string ) => {
	const _ret = ipaddress.split (':')
	return _ret[_ret.length - 1]
}

const homePage = 'https://conetech.ca'
const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )

class conet_dl_server {
	// @ts-ignore
    private localserver: Server
	private PORT: any
	private appsPath = ''
	private s3pass: s3pass|null = null
	private initData: ICoNET_NodeSetup|null = null
	private debug = false
	private ver = ''
	private workerNumber = -1
	private initSetupData = async () => {
		if ( Cluster.isWorker && Cluster?.worker?.id ) {
			this.workerNumber = Cluster?.worker?.id
		}
		
		logger (Colors.blue (`[${ this.workerNumber }] packageFile = ${ packageFile }`))
		
		this.ver = packageJson.version

		const setup = join( homedir(),'.master.json' )
		const masterSetup: ICoNET_DL_masterSetup = require ( setup )
		this.initData = await getSetup ( true )
		if ( !this.initData ) {
			throw new Error (`getSetup had null ERROR!`)
		}

		this.s3pass = await s3fsPasswd ()
		if (!this.s3pass) {
			throw new Error (`s3pass had null ERROR!`)
		}

		this.initData.keyObj = await loadWalletAddress (this.initData.keychain, masterSetup.passwd )
		this.appsPath = this.initData.setupPath
		this.PORT = this.initData.ipV4Port
		this.startServer()

		setInterval
	}

	constructor () {
		this.initSetupData ()
    }

	private startServer = () => {
		const staticFolder = join ( this.appsPath, 'static' )
		const launcherFolder = join ( this.appsPath, 'launcher' )
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use ( Express.static ( staticFolder ))
        app.use ( Express.static ( launcherFolder ))
        app.use ( Express.json())

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

		const option: ServerOptions = {
			key: readFileSync(masterSetup.ssl.key, 'utf8'),
			cert: readFileSync(masterSetup.ssl.certificate, 'utf8'),
			
		}

		this.localserver = createServer (option, app ).listen (this.PORT, async () => {
			
            return console.table([
                { 'CoNET DL node ': `mvp-dl version [${ this.ver } Worker , Url: http://${ this.initData?.ipV4 }:${ this.PORT }, local-path = [${ staticFolder }]` }
            ])
        })

		if ( this.debug ) {
			app.use ((req, res, next) => {
				const afterResponse = () => {

					logger (`Server has request from ${ req.ip } request string:[${ req.url }]`)

					res.removeListener('finish', afterResponse)
    				res.removeListener('close', afterResponse)
					return
				}

				res.once('finish', afterResponse)
    			res.once('close', afterResponse)
				next()
			})
		}

		this.router (router)

		app.get ('/', (req, res) => {
			logger (Colors.red(`Worker [${ this.workerNumber }] get [${ splitIpAddr (req.ip) }] / redirect to home!`))
			res.writeHead(301, { "Location": homePage }).end ()
		})

		app.all ('*', (req, res) => {
			logger (Colors.red(`Worker [${ this.workerNumber }] get unknow url Error! [${ splitIpAddr (req.ip) }] => [${ req.url }]`))
			return res.status(404).end (return404 ())
		})
		
	}

	public end () {
        this.localserver.close ()
    }

	private router ( router: Router ) {

		
		router.get ('/publishKey', async (req,res) => {
			if (!this.initData) {
				logger (Colors.red(`conet_dl_server /publishKey have no initData! response 404`))
				return res.status (404).end()
			}
			
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /publishKey to [${ splitIpAddr ( req.ip )}]`))
			
			return res.json ({ publickey: this.initData.keyObj[0].publickey }).end()
		})

		router.get ('/conet-price', async (req,res) => {
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /conet-price to [${ splitIpAddr ( req.ip )}]`))
			const prices = await getLast5Price ()
			return res.json (prices).end()
		})

		router.post ('/conet-si-node-register', async ( req, res ) => {
			const message: string = req.body.message
			const signature: string = req.body.signature
			const dataPayload = decryptPayload (message, signature )
			
			if ( !dataPayload?.payload?.ipV4 ) {
				logger (Colors.red(`/conet-si-node-register has unknow payload [${this.workerNumber}][${splitIpAddr ( req.ip )}]`), inspect({body: req.body, dataPayload} , false, 3, true))
				return res.status(404).end (return404 ())
			}

			logger (Colors.blue(`app.post ('/conet-si-node-register') call CoNET_SI_Register! [${this.workerNumber}][${splitIpAddr ( req.ip )}]`), inspect(dataPayload, false, 3, true))

			if (!this.s3pass ) {
				return res.status(501).end ()
			}

			const ret = await CoNET_SI_Register (dataPayload, this.s3pass )

			logger (`CoNET_SI_Register return [${ret}]`)

			if (!ret ) {
				return res.status(404).end(return404 ())
			}

			return res.json ({nft_tokenid:ret }).end()
			
		})
		
		router.post('/si-health', async (req, res) => {
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /si-health to [${ splitIpAddr ( req.ip )}]`))
			const message: string = req.body?.message
			const signature: string = req.body?.signature

			if ( !message || !signature ) {
				logger (Colors.red(`/si-health none message && signature ERROR!`), inspect( req.body, false, 3, true))
				return res.status(404).end (return404 ())
			}
			const ret = await CoNET_SI_health( message, signature )
			if ( !ret ) {
				logger (Colors.red(`/si-health none message && signature ERROR!`), inspect( req.body, false, 3, true ))
				logger (`/si-health CoNET_SI_health ERROR!`)
				return res.status(404).end (return404 ())
			}
			return res.json ({}).end()
		})

		router.post ('/conet-faucet', (req, res ) => {
			const ip = splitIpAddr ( req.ip )
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /conet-faucet to [${ ip }]`))
			const wallet_add = req.body?.walletAddr

			if (!wallet_add || !Web3.utils.isAddress(wallet_add)) {
				logger (`Worker [${ this.workerNumber }] POST /conet-faucet ERROR! Have no walletAddr [${ip}]`, inspect(req.body, false, 3, true))
				return res.status(404).end(return404 ())
			}

			return regiestFaucet(wallet_add, ip).then (n => {
				if (!n) {
					return res.status(404).end(return404 ())
				}
				return res.json ({txHash:n}).end ()
			})

		})

		router.post ('/mint_conetcash', async (req, res ) => {
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /mint_conetcash to [${ splitIpAddr ( req.ip )}]`))
			const txHash = req.body?.txHash
			const sign = req.body?.sign
			
			if ( !this.initData || !sign || !txHash) {
				res.status(404).end(return404 ())
				return logger (`/mint_conetcash have no req.body?.cipher or cipher !== 'string'`, inspect(req.body, false, 3, true))
			}
			
			const ret = await mint_conetcash (txHash, sign)
			if (!ret) {
				res.status(404).end(return404 ())
				return logger (`/mint_conetcash have no req.body?.cipher or cipher !== 'string'`, inspect(req.body, false, 3, true))
			}
			return res.json ({id: ret}).end ()

		})

		router.post ('/exchange_conet_usdc', async (req, res) => {
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /exchange_conet_usdc to [${ splitIpAddr ( req.ip )}]`))
			
			const txHash = req.body?.txHash
			if (!txHash) {
				logger (`/exchange_conet_usdc have no txHash`, inspect (req.body, false, 3, true))
				return res.status(404).end(return404 ())
			}
			logger (`exchange_conet_usdc access by [${ txHash }]`)
			const data = await exchangeUSDC (txHash)
			if (!data) {
				logger (`/exchange_conet_usdc [${ txHash }] data error!`)
				return res.status(404).end(return404 ())
			}
			
			return res.json ({transactionHash: data}).end ()
		})

		router.post ('/conetcash_balance', async (req, res ) => {
			logger (Colors.blue(` Worker [${ this.workerNumber }] Router /conetcash_balance to [${ splitIpAddr ( req.ip )}]`))
			const id = req.body?.id
			if ( !this.initData || !id ) {
				res.status(404).end(return404 ())
				return logger (`/mint_conetcash have no req.body?.cipher or cipher !== 'string'`, inspect(req.body, false, 3, true))
			}
			const sign = req.body?.sign
			const ret = await conetcash_getBalance (id)
			return res.json (ret).end ()
		})

		router.post ('/conet-si-list', async ( req, res ) => {
			logger (Colors.blue(`Worker [${this.workerNumber}] POST /conet-si-lis [${splitIpAddr ( req.ip )}]`))
			const sortby: SINodesSortby = req.body.sortby
			const region: SINodesRegion = req.body.region
			const result = await getSI_nodes (sortby, region)
			return res.json(result).end()
		})

		router.all ('*', (req, res ) =>{
			logger (Colors.red(`Worker [${ this.workerNumber }] Router /api get unknow router ${ splitIpAddr (req.ip) } [${ req.url }]`))
			return res.status(404).end()
		})
	}
	
}

export default conet_dl_server