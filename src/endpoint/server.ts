/**
 * 			
 * */
import Express from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register } from './help-database'
import Colors from 'colors/safe'

import { logger, loadWalletAddress, getSetup, waitKeyInput, return404, returnHome, decryptPayload } from '../util/util'

class conet_dl_server {
	// @ts-ignore
    private localserver: Server
	private PORT: any
	private appsPath = ''
	private initData: ICoNET_NodeSetup|null = null
	private initSetupData = async () => {
		// @ts-ignore: Unreachable code error
		this.initData = await getSetup ( this.debug )

		if ( !this.initData?.keychain ) {
			throw new Error (`Error: have no setup data!\nPlease restart CoNET-DI`)
		}

		// @ts-ignore: Unreachable code error
		const passwd = await waitKeyInput (`Please enter the wallet password: `, true )
		this.appsPath = this.initData.setupPath
		this.initData.keyObj = await loadWalletAddress (this.initData.keychain, passwd )

		this.debug? logger ('loadWalletAddress success', inspect (this.initData, false, 3, true )): null
		this.PORT = this.initData.ipV4Port
		this.startServer()
	}

	constructor ( private debug: boolean, private version: string ) {
		this.initSetupData ()
    }

	private startServer = () => {
		const staticFolder = join ( this.appsPath, 'static' )
		const launcherFolder = join ( this.appsPath, 'launcher' )
		const app = Express()
		const Cors = require('cors')
		app.use( Cors ())
		app.use ( Express.static ( staticFolder ))
        app.use ( Express.static ( launcherFolder ))
        app.use ( Express.json() )

		app.once ( 'error', ( err: any ) => {
			/**
			 * https://stackoverflow.com/questions/60372618/nodejs-listen-eacces-permission-denied-0-0-0-080
			 * > sudo apt-get install libcap2-bin 
			 * > sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
			 * 
			 */
            logger (err)
            logger (`Local server on ERROR`)
        })

		app.post ('/conet-si-node-register', ( req, res ) => {
			const payload = req.body.payload
			
			return decryptPayload (payload, this.initData )
			.then (dataPayload=> {
				if ( !dataPayload ) {
					logger (`/conet-si-node-register has unknow payload`)
					return res.end (return404 ())
				}
				logger (`app.post ('/conet-si-node-register') call CoNET_SI_Register!`)
				
				CoNET_SI_Register (dataPayload)

				logger (`app.post ('/conet-si-node-register') success!`)
				return res.end ()
			})
		})

		app.get ('/CoNET-SI-list', (req,res) => {
			
		})

		this.localserver = app.listen ( this.PORT, () => {
            return console.table([
                { 'CoNET DL node': `mvp-dl version is [${ this.version }], Url: http://${ this.initData?.ipV4 }:${ this.PORT }, local-path = [${ staticFolder }]` }
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

		app.get ('/', (req, res) => {
			res.end (returnHome())
		})

		app.get('*', (req, res) => {
			return res.end (return404 ())
		})

		app.post('*', (req, res) => {
			return res.end (return404 ())
		})
		
	}

	public end () {
        this.localserver.close ()
    }
}

export default conet_dl_server