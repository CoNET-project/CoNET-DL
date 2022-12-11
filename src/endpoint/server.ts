/**
 * 			
 * */
import Express, { Router } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register, regiestFaucet, getLast5Price, exchangeUSDC, mint_conetcash, conetcash_getBalance, CoNET_SI_health, getSI_nodes, authorizeCoNETCash } from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import Web3 from 'web3'
import { readFileSync } from 'node:fs'
import { logger, loadWalletAddress, getSetup, return404, decryptPayload, s3fsPasswd, decryptPgpMessage, makePgpKeyObj, postRouterToPublic } from '../util/util'
import { createServer} from 'node:https'
import type { ServerOptions } from 'node:https'
import Cluster from 'node:cluster'
import type { Request, Response } from 'express'

const splitIpAddr = (ipaddress: string ) => {
	if (!ipaddress?.length) {
		logger (Colors.red(`splitIpAddr ipaddress have no ipaddress?.length`), inspect( ipaddress, false, 3, true ))
		return ''
	}
	const _ret = ipaddress.split (':')
	return _ret[_ret.length - 1]
}



const homePage = 'https://conetech.ca'
const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

const getRedirect = (req: Request, res: Response ) => {
	const worker = Cluster?.worker?.id ? Cluster.worker.id : 5
	switch (worker) {
		case 4:
		case 1: {
			const localtion = `https://conettech.ca`
			logger (Colors.red(`get [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
			return res.writeHead(301, { "Location": localtion }).end ()
		}
		case 2: {
			const localtion = `https://kloak.io`
			logger (Colors.red(`get [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
			return res.writeHead(301, { "Location": localtion }).end ()
		}
		case 3: {
			const localtion = `https://kloak.app`
			logger (Colors.red(`get [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
			return res.writeHead(301, { "Location": localtion }).end ()
		}
		
		default : {
			const localtion = `https://conettech.ca`
			logger (Colors.red(`goto default [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] redirect to ${ localtion }!`))
			return res.writeHead(301, { "Location": localtion }).end ()
		}
	}
}
class conet_dl_server {
	// @ts-ignore
    private localserver: Server
	private PORT: any
	private appsPath = ''
	private s3pass: s3pass|null = null
	private initData: ICoNET_NodeSetup|null = null
	private debug = false

	private si_pool = []
	private si_pool_last = 0
	private initSetupData = async () => {

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

		await makePgpKeyObj ( this.initData.pgpKeyObj, masterSetup.passwd )

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
                { 'CoNET DL node ': `mvp-dl version [${ version } Worker , Url: http://${ this.initData?.ipV4 }:${ this.PORT }, local-path = [${ staticFolder }]` }
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

		app.get ('*', (req, res ) => {
			
			return getRedirect (req, res)
		})

		app.all ('*', (req, res) => {
			logger (Colors.red(`get unknow router ${ splitIpAddr (req.ip) }  ==> [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] response 404 STOP connect!`))
			return res.status(404).end ()
		})
		
	}

	public end () {
        this.localserver.close ()
    }

	private router ( router: Router ) {
		
		
		router.get ('/publishGPGKeyArmored', async (req,res) => {
			if (!this.initData) {
				logger (Colors.red(`conet_dl_server /publishKey have no initData! response 404`))
				return res.status (404).end()
			}
			
			logger (Colors.blue(` Router /publishKey to [${ splitIpAddr ( req.ip )}]`))
			
			return res.json ({ publishGPGKey: this.initData.pgpKeyObj.publicKeyArmored }).end()

		})

		router.get ('/conet-price', async (req,res) => {
			logger (Colors.blue(`Router /conet-price to [${ splitIpAddr ( req.ip )}]`))
			const prices = await getLast5Price ()
			return res.json (prices).end()
		})

		router.post ('/conet-si-node-register', async ( req, res ) => {
			const pgpMessage = req.body?.pgpMessage
			
			if ( !pgpMessage ) {
				logger (Colors.red(`/conet-si-node-register has unknow payload [${splitIpAddr ( req.ip )}]`), inspect(req.body, false, 3, true))
				return res.status(404).end ()
			}

			if (!this.s3pass ) {
				logger (Colors.red(`[${ splitIpAddr ( req.ip ) }] => /conet-si-node-register this.s3pass null ERROR!`))
				return res.status(501).end ()
			}

			const obj = <ICoNET_DL_POST_register_SI> await decryptPgpMessage (pgpMessage, this.initData?.pgpKeyObj.privateKeyObj)

			if (!obj) {
				logger (Colors.red(`[${splitIpAddr ( req.ip )}] => /conet-si-node-register decryptPgpMessage ERROR!`), inspect(req.body , false, 3, true))
				return res.status(404).end ()
			}
			

			const ret = await CoNET_SI_Register ( obj, this.s3pass )

			if (!ret ) {
				logger (Colors.red(`[${ splitIpAddr ( req.ip ) }] => /conet-si-node-register CoNET_SI_Register return null ERROR`))
				return res.status(404).end()
			}

			return res.json ({ nft_tokenid: ret }).end()
			
		})
		
		router.post('/si-health', async (req, res) => {
			
			const pgpMessage = req.body?.pgpMessage

			if ( !pgpMessage) {
				logger (Colors.red(`[${splitIpAddr ( req.ip )}] ==> /si-health has unknow payload `), inspect(req.body, false, 3, true))
				return res.status(404).end ()
			}

			const obj = await decryptPgpMessage (pgpMessage, this.initData?.pgpKeyObj.privateKeyObj)

			if (!obj) {
				logger (Colors.red(`[${splitIpAddr ( req.ip )}] => /si-health decryptPgpMessage ERROR!`), inspect(req.body, false, 3, true))
				return res.status(404).end ()
			}

			//	@ts-ignore
			const hObj: ICoNET_DL_POST_register_SI = obj

			const ret = await CoNET_SI_health ( hObj )

			if ( !ret ) {
				logger (Colors.red(`/si-health none message && signature ERROR!`), inspect( req.body, false, 3, true ))
				logger (`/si-health CoNET_SI_health ERROR!`)
				return res.status(404).end ()
			}

			logger (Colors.grey(`[${splitIpAddr ( req.ip )}] ==> /si-health success!`))
			return res.json ({}).end()
		})

		router.post ('/conet-faucet', (req, res ) => {
			const ip = splitIpAddr ( req.ip )
			logger (Colors.blue(`Router /conet-faucet to [${ ip }]`))
			const wallet_add = req.body?.walletAddr

			if (!wallet_add || !Web3.utils.isAddress(wallet_add)) {
				logger (`POST /conet-faucet ERROR! Have no walletAddr [${ip}]`, inspect(req.body, false, 3, true))
				return res.status(400).end()
			}

			return regiestFaucet(wallet_add, ip).then (n => {
				if (!n) {
					return res.status(400).end()
				}
				return res.json ({txHash:n}).end ()
			})

		})

		router.post ('/mint_conetcash', async (req, res ) => {
			logger (Colors.blue(`Router /mint_conetcash to [${ splitIpAddr ( req.ip )}]`))
			const txHash = req.body?.txHash
			const sign = req.body?.sign
			const txObj = req.body?.txObj
			
			if ( !this.initData || !sign || !txHash || !txObj) {
				res.status(404).end()
				return logger (`/mint_conetcash have no req.body?.cipher or cipher !== 'string'`, inspect(req.body, false, 3, true))
			}
			
			const ret = await mint_conetcash (txObj, txHash, sign)
			if (!ret) {
				res.status(404).end()
				return logger (`/mint_conetcash have no req.body?.cipher or cipher !== 'string'`, inspect(req.body, false, 3, true))
			}
			return res.json ({id: ret}).end ()

		})

		router.post ('/exchange_conet_usdc', async (req, res) => {
			logger (Colors.blue(`Router /exchange_conet_usdc to [${ splitIpAddr ( req.ip )}]`))
			
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
			logger (Colors.blue(`Router /conetcash_balance to [${ splitIpAddr ( req.ip )}]`))
			const id = req.body?.id

			if ( !this.initData || !id ) {
				res.status(404).end()
				return logger (`/conetcash_balance have no id`, inspect(req.body, false, 3, true))
			}

			const ret = await conetcash_getBalance (id)
			return res.json (ret).end ()
		})

		router.post ('/conet-si-list', async ( req, res ) => {
			logger (Colors.blue(`POST ${ splitIpAddr (req.ip) }  ==> [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }]`))
			const sortby: SINodesSortby = req.body.sortby
			const region: SINodesRegion = req.body.region
			const result = await getSI_nodes (sortby, region, this.si_pool, this.si_pool_last)
			return res.json(result).end()
		})

		router.post ('/authorizeCoNETCash', async (req, res ) => {
			const CoNETCash_authorizedObj = req.body?.CoNETCash_authorizedObj
			const authorizedObjHash = req.body?.authorizedObjHash
			const sign = req.body?.sign

			if (!CoNETCash_authorizedObj||!authorizedObjHash||!sign) {
				res.status(404).end()
				return logger (`/authorizeCoNETCash [${ splitIpAddr (req.ip) }] have no correct parameters!`, inspect(req.body, false, 3, true))
			}
			logger (Colors.blue (`/authorizeCoNETCash from [${ splitIpAddr (req.ip) }] call authorizeCoNETCash`))
			logger (inspect(req.body, false, 3, true ))
			const ret = await authorizeCoNETCash (CoNETCash_authorizedObj, authorizedObjHash, sign)
			if (!ret) {
				return res.status(400).end()
			}
			return res.json ({id: ret}).end ()
		})

		router.post ('/regiestProfileRoute', async (req, res ) => {

			
			const pgpMessage = req.body?.pgpMessage

			if ( !pgpMessage?.length || !this.s3pass || !this.initData) {
				logger (Colors.red(`Router /regiestProfileRouter [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] pgpMessage null Error!`))
				return res.status(404).end()
			}

			let obj = <ICoNET_Profile|null> await decryptPgpMessage (pgpMessage, this.initData.pgpKeyObj.privateKeyObj)

			if (!obj) {
				logger (Colors.red(`Router /regiestProfileRoute [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }] decryptPgpMessage Error!`))
				return res.status(400).end()
			}

			const obj1 = await decryptPayload (obj)
			if ( !obj1 ) {
				return res.status(400).end()
			}
			res.json({}).end()
			await postRouterToPublic (null, obj1, this.s3pass)

		})


		router.get ('*', (req, res ) =>{
			logger (Colors.red(`Router.get unknow Redirect [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }]`))
			return getRedirect (req, res)
		})

		router.all ('*', (req, res ) =>{
			logger (Colors.red(`Router /api get unknow router [${ splitIpAddr (req.ip) }] => ${ req.method } [http://${ req.headers.host }${ req.url }]`))
			return res.status(404).end()
		})
	}
	
}

export default conet_dl_server