/**
 * 			
 * */
import Express from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register, regiestFaucet, streamCoNET_USDCPrice, getLast5Price, exchangeUSDC } from './help-database'
import Colors from 'colors/safe'
import { homedir, platform } from 'node:os'
import Web3 from 'web3'
import { logger, loadWalletAddress, getSetup, waitKeyInput, return404, returnHome, decryptPayload } from '../util/util'


class conet_dl_server {
	// @ts-ignore
    private localserver: Server
	private PORT: any
	private appsPath = ''
	private initData: ICoNET_NodeSetup|null = null
	private master_wallet = ''
	private streamCoNET_USDCPriceQuere = []
	private initSetupData = async () => {
		// @ts-ignore: Unreachable code error
		this.initData = await getSetup ( this.debug )
		const setup = join( homedir(),'master.json' )
		const masterSetup: ICoNET_DL_masterSetup = require ( setup )
		let passwd = this.password
		if ( !this.initData?.keychain ) {
			throw new Error (`Error: have no setup data!\nPlease restart CoNET-DI`)
		}

		
		if ( !passwd) {
			// @ts-ignore: Unreachable code error
			passwd = await waitKeyInput (`Please enter the wallet password: `, true )
		}
		
		this.appsPath = this.initData.setupPath
		this.initData.keyObj = await loadWalletAddress (this.initData.keychain, passwd )

		this.debug? logger ('loadWalletAddress success', inspect (this.initData, false, 3, true )): null
		this.PORT = this.initData.ipV4Port
		this.startServer()
	}

	constructor ( private debug: boolean, private version: string, private password: string ) {
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
			const payload: any = req.body.payload
			
			return decryptPayload (payload, this.initData )
			.then (dataPayload=> {
				if ( !dataPayload ) {
					logger (`/conet-si-node-register has unknow payload`)
					return res.status(404).end (return404 ())
				}
				logger (`app.post ('/conet-si-node-register') call CoNET_SI_Register!`)
				
				CoNET_SI_Register (dataPayload)

				logger (`app.post ('/conet-si-node-register') success!`)
				return res.end ()
			})
		})

		app.get ('/conet-price', async (req,res) => {
			const prices = await getLast5Price ()
			return res.json (prices).end()
		})

		app.get ('/conet-si-list', (req,res) => {
			
		})

		app.post ('/conet-faucet', (req, res ) => {

			const wallet_addr = req.body?.walletAddr
			if (!wallet_addr || !Web3.utils.isAddress(wallet_addr)) {
				logger (`/conet-faucet ERROR! Have no walletAddr`, inspect(req.body, false, 3, true))
				return res.status(404).end(return404 ())
			}

			logger (`/conet-faucet!`)
			return regiestFaucet(wallet_addr).then (n => {
				if (!n) {
					return res.status(404).end(return404 ())
					
				}
				return res.json ({}).end ()
			})

		})

		app.post ('/exchange_conet_usdc', async (req, res) => {
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
			
			return res.json ({}).end ()
		})

		this.localserver = app.listen ( this.PORT, async () => {
			
			streamCoNET_USDCPrice (this.streamCoNET_USDCPriceQuere)
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

			return res.status(404).end (return404 ())
		})

		app.post('*', (req, res) => {
			return res.status(404).end (return404 ())
		})
		
	}

	public end () {
        this.localserver.close ()
    }
}

export default conet_dl_server