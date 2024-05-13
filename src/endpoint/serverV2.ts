/**
 * 			
 * */
import Express, { Router } from 'express'

import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { CoNET_SI_Register, regiestFaucet, getLast5Price,
	CoNET_SI_health, getIpAttack, getOraclePrice, txManager, freeMinerManager,
	addIpaddressToLivenessListeningPool, claimeToekn, selectLeaderboard
} from './help-database'
import Colors from 'colors/safe'
import { homedir } from 'node:os'
import {v4} from 'uuid'
import Cluster from 'node:cluster'
import { logger, checkErc20Tx, checkValueOfGuardianPlan, checkTx, getAssetERC20Address, checkReferralsV2_OnCONET_Holesky,
	returnGuardianPlanReferral, CONET_guardian_Address, loadWalletAddress, getSetup, return404, 
	decryptPayload, decryptPgpMessage, makePgpKeyObj, checkSignObj, getNetworkName, getCNTPMastersBalance, listedServerIpAddress, getServerIPV4Address, s3fsPasswd, storageWalletProfile, conet_Holesky_rpc, sendCONET
} from '../util/util'

import {ethers} from 'ethers'
import { exec } from 'node:child_process'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'

//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const setup = join( homedir(),'.master.json' )
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version
const FaucetCount = '0.01'

let leaderboardData = {
	epoch: '',
	free_cntp: null,
	free_referrals: null,
	guardians_cntp: null, 
	guardians_referrals: null
}

interface rate_list {
	wallet: string
	cntpRate: string
	referrals: string
}
let free_referrals_rate_lists: rate_list[] = []

let guardians_referrals_rate_lists: rate_list[] = []

const makeLeaderboardData = async () => {
	
	//@ts-ignore
	const LeaderboardData = await selectLeaderboard()
	if (!LeaderboardData) {
		return
	}
	leaderboardData.epoch = LeaderboardData.epoch
	leaderboardData.free_cntp = LeaderboardData.free_cntp
	leaderboardData.free_referrals = LeaderboardData.free_referrals
	leaderboardData.guardians_cntp = LeaderboardData.guardians_cntp
	leaderboardData.guardians_referrals = LeaderboardData.guardians_referrals
	free_referrals_rate_lists = LeaderboardData.free_referrals_rate_list
	guardians_referrals_rate_lists = LeaderboardData.guardians_referrals_rate_list
}

export const startListeningCONET_Holesky_EPOCH = async () => {
	
	
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	
	provideCONET.on('block', async block => {
		await makeLeaderboardData()
	})

	await makeLeaderboardData()
}


//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

const addAttackToCluster = async (ipaddress: string) => {
	const option: RequestOptions = {
		hostname: 'apiv2.conet.network',
		path: `/api/ipaddress`,
		port: 4100,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		ipaddress: ipaddress
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {
			logger(Colors.blue(`addAttackToCluster [${ipaddress}] success! data = [${data}]`))
		})
	})

	req.once('error', (e) => {
		logger(Colors.red(`addAttackToCluster r[${ipaddress}] equest on Error! ${e.message}`))
	})

	req.write(JSON.stringify(postData))
	req.end()
}


class conet_dl_server {

	private PORT = 8000
	private appsPath = ''
	private initData: ICoNET_NodeSetup|null = null
	private debug = false
	private serverID = ''

	private si_pool: nodeType[] = []
	private masterBalance: CNTPMasterBalance|null = null
	private s3Pass: s3pass|null = null

	private initSetupData = async () => {
		
		this.initData = await getSetup ( true )
		if ( !this.initData ) {
			throw new Error (`getSetup had null ERROR!`)
		}

		this.initData.keyObj = await loadWalletAddress (this.initData.keychain )

		await makePgpKeyObj ( this.initData.pgpKeyObj )

		this.appsPath = this.initData.setupPath

        logger (Colors.blue(`start local server!`))
		this.masterBalance = await getCNTPMastersBalance(masterSetup.conetPointAdmin)
		this.serverID = getServerIPV4Address(false)[0]
		logger(Colors.blue(`serverID = [${this.serverID}]`))
		this.s3Pass = await s3fsPasswd()
		this.startServer()
		

	}

	constructor () {
		this.initSetupData ()
		startListeningCONET_Holesky_EPOCH()
    }

	private startServer = async () => {
		const staticFolder = join ( this.appsPath, 'static' )
		const launcherFolder = join ( this.appsPath, 'launcher' )
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		app.use( Cors ())
		app.use ( Express.static ( staticFolder ))
        app.use ( Express.static ( launcherFolder ))
		app.use (async (req, res, next) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			if (!ipaddress) {
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			return getIpAttack(ipaddress, this.serverID, (err, data) => {
				if (err) {
					logger(Colors.red(`getIpAttack return Error! STOP connecting`), err)
					return res.status(404).end()
				}
				if (data) {
					logger(Colors.red(`[${ipaddress}] ${req.method} => ${req.url} ATTACK stop request`))
					res.status(404).end()
					res.socket?.end().destroy()
					return addAttackToCluster (ipaddress)
				}
				
				if (/^post$/i.test(req.method)) {
					
					return Express.json({limit: '25mb'})(req, res, err => {
						if (err) {
							
							res.sendStatus(400).end()
							res.socket?.end().destroy()
							return addAttackToCluster (ipaddress)
							
						}
						return next()
					})
				}
				
				return next()
			})

			
		})

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
			const ipaddress = getIpAddressFromForwardHeader(req)
			//logger (Colors.red(`get unknow router from ${ipaddress} => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end ()
			return res.socket?.end().destroy()
		})

		server.listen(this.PORT, '0.0.0.0', () => {
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}]` }
            ])
		})
		
	}

	private router ( router: Router ) {
		
		router.get ('/publishGPGKeyArmored', async (req,res) => {

			if (!this.initData) {
				logger (Colors.red(`conet_dl_server /publishKey have no initData! response 404`))
				res.status (404).end()
				return res.socket?.end().destroy()
			}
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(` Router /publishKey form [${ ipaddress}]`), inspect(req.headers, false, 3, true))

			res.json ({ publishGPGKey: this.initData.pgpKeyObj.publicKeyArmored }).end()
			return res.socket?.end().destroy()

		})

		router.get ('/health', async (req,res) => {

			if (!this.initData) {
				logger (Colors.red(`conet_dl_server /publishKey have no initData! response 404`))
				res.status (404).end()
				return res.socket?.end().destroy()
			}
			
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(` Router /health form [${ ipaddress}]`))

			res.json ({ health: true }).end()
			return res.socket?.end().destroy()

		})

		router.get ('/conet-price', async (req,res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.blue(`Router /conet-price to [${ ipaddress }]`))
			const prices = await getLast5Price ()
			logger (inspect(prices, false, 3, true))
			res.json (prices).end()
			return res.socket?.end().destroy()

		})

		router.post ('/stop-liveness', async (req,res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// const ipaddress = req.headers['cf-connecting-ip']||splitIpAddr(req.ip)
			
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /stop-liveness message = req.body.message ERROR!`))
				return res.status(404).end()
				
			}
			
			if (!message||!this.initData||!signMessage) {
				logger (Colors.grey(`Router /stop-liveness !message||!this.initData||!signMessage Error!`))
				return  res.status(404).end()
				
			}
			
			const obj = checkSignObj (message, signMessage)

			if (!obj) {
				logger (Colors.grey(`Router/stop-liveness !obj Error!`))
				return res.status(404).end()
			}


			if (!ipaddress) {
				logger (Colors.grey(`Router /stop-liveness !ipaddress Error!`))
				return res.status(404).end()
			}
			
			obj.ipAddress = ipaddress
			const cmd: clusterMessage = {
				cmd:'stop-liveness',
				data: [obj],
				uuid: v4(),
				err: null
			}
			logger(Colors.grey(`[${obj.ipAddress}] /stop-liveness`))
			if ( process.connected && typeof process.send === 'function') {
				process.send (cmd)
			}
			
			return res.status(200).end()
		})

		router.post ('/conet-si-node-register', async ( req, res ) => {
			const pgpMessage = req.body?.pgpMessage
			const ipaddress = getIpAddressFromForwardHeader(req)
			if ( !pgpMessage || !this.initData) {
				logger (Colors.red(`/conet-si-node-register has unknow payload [${ipaddress}]`), inspect(req.body, false, 3, true))
				res.status(404).end ()
				return res.socket?.end().destroy()
			}

			const obj = <ICoNET_DL_POST_register_SI> await decryptPgpMessage (pgpMessage, this.initData.pgpKeyObj.privateKeyObj)

			if (!obj || !ipaddress ) {
				logger (Colors.red(`[${ipaddress}] => /conet-si-node-register decryptPgpMessage or no ipaddress {${ipaddress}} ERROR!`), inspect(req.body , false, 3, true))
				res.status(404).end ()
				return res.socket?.end().destroy()
			}
			obj.ipV4 = ipaddress
			const ret = await CoNET_SI_Register ( obj)

			if (!ret ) {
				logger (Colors.red(`[${ ipaddress }] => /conet-si-node-register CoNET_SI_Register return null ERROR`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			res.json ({ nft_tokenid: ret }).end()
			return res.socket?.end().destroy()
			
		})
		
		router.post('/si-health', async (req, res) => {
			
			const pgpMessage = req.body?.pgpMessage
			const ipaddress = getIpAddressFromForwardHeader(req)
			if ( !pgpMessage) {
				logger (Colors.red(`[${ipaddress}] ==> /si-health has unknow payload `), inspect(req.body, false, 3, true))
				return res.status(404).end ()
			}

			const obj = await decryptPgpMessage (pgpMessage, this.initData?.pgpKeyObj.privateKeyObj)

			if (!obj || !ipaddress) {
				logger (Colors.red(`[${ipaddress}] => /si-health decryptPgpMessage || null ipaddress [${ipaddress}] ERROR!`), inspect(req.body, false, 3, true))
				return res.status(404).end ()
				
			}

				// @ts-ignore
			const hObj: ICoNET_DL_POST_register_SI = obj
			hObj.ipV4 = ipaddress
			const ret = await CoNET_SI_health ( hObj )

			if ( !ret ) {
				logger (Colors.red(`/si-health from ${ipaddress} has none message && signature ERROR!`), inspect( req.body, false, 3, true ))
				logger (`/si-health CoNET_SI_health ERROR!`)
				return res.status(404).end ()
				
			}

			logger (Colors.grey(`[${ipaddress}] ==> /si-health SUCCESS!`))
			return res.json (this.si_pool).end()
			
		})

		router.post ('/myIpaddress', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			return res.json ({ipaddress}).end ()
		})

		//********************			V2    		****** */				
		router.post ('/conet-faucet', (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// logger (Colors.grey(`Router /conet-faucet to [${ ipaddress }]`))
			const wallet_add = req.body?.walletAddr

			if (!wallet_add ||!ipaddress) {
				logger (`POST /conet-faucet ERROR! Have no walletAddr [${ipaddress}]`, inspect(req.body, false, 3, true))
				res.status(400).end()
				return res.socket?.end().destroy()
			}

			return regiestFaucet(wallet_add, ipaddress).then (async n => {
				if (!n) {
					res.status(400).end()
					return res.socket?.end().destroy()
				}
				
				const tx = await sendCONET(masterSetup.conetFaucetAdmin, FaucetCount, wallet_add)
				if (!tx) {
					res.status(403).end()
					return res.socket?.end().destroy()
				}
				logger(inspect(tx, false, 3, true))
				return res.json ({tx}).end ()
			})

		})

		router.get ('/conet-nodes', async ( req, res ) => {
			res.json({node:this.si_pool, masterBalance: this.masterBalance}).end()
		})

		router.post ('/regiestProfileRoute', async (req, res ) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			const pgpMessage = req.body?.pgpMessage

			if ( !pgpMessage?.length || !this.initData) {
				logger (Colors.red(`Router /regiestProfileRouter [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] pgpMessage null Error!`))
				res.status(404).end()
				return res.socket?.end().destroy()
			}

			let obj = <ICoNET_Profile|null> await decryptPgpMessage (pgpMessage, this.initData.pgpKeyObj.privateKeyObj)

			if (!obj) {
				logger (Colors.red(`Router /regiestProfileRoute [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] decryptPgpMessage Error!`))
				res.status(400).end()
				return res.socket?.end().destroy()
			}

			const obj1 = await decryptPayload (obj)
			if ( !obj1 ) {
				res.status(400).end()
				return res.socket?.end().destroy()
			}
			logger(Colors.gray(``))
			return res.json({}).end()
			
			//await postRouterToPublic (null, obj1, this.s3pass)

		})

		router.post ('/storageFragments', async (req, res ) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}

			const obj = checkSignObj (message, signMessage)

			if (!obj || !obj?.data || !this.s3Pass) {
				logger (Colors.grey(`Router /storageFragments !obj or this.saPass Error! ${ipaddress} `), inspect(this.s3Pass, false, 3, true), inspect(obj, false, 3, true))
				return res.status(403).end()
			}
			const uu = await storageWalletProfile(obj, this.s3Pass)
			if (!uu) {
				return res.status(504).end()
			}
			return res.status(200).json({}).end()
		})

		router.post ('/claimToken', async ( req, res ) => {

			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(404).end()
			}
			
			const response = await claimeToekn (message, signMessage)
			if (response) {
				return res.status(200).json({}).end()
			}
			return res.status(403).end()

		})

		router.get ('/asset-prices', async ( req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			
			let kk
			try {
				kk = await getOraclePrice()
			} catch (ex) {
				logger(Colors.gray(`/asset-prices from ${ipaddress} Error!` ), ex)
				return res.status(403).json({}).end()
			}
			logger(Colors.gray(`/asset-prices from ${ipaddress} success!` ), inspect(kk, false, 3, true))
			return res.status(200).json(kk).end()
		})

		router.post ('/Purchase-Guardian', async (req,res) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			// const ipaddress = req.headers['cf-connecting-ip']||splitIpAddr(req.ip)
			
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /Purchase-Guardian message = req.body.message ERROR!`), inspect(req.body, false, 3, true))
				return res.status(403).end()
				
			}
			
			if (!message||!signMessage) {
				logger (Colors.grey(`Router /Purchase-Guardian !message||!signMessage Error!`), inspect(req.body, false, 3, true))
				return  res.status(403).end()
				
			}
			
			const obj = checkSignObj (message, signMessage)

			if (!obj||!obj?.data) {
				logger (Colors.grey(`Router /Purchase-Guardian checkSignObj obj Error!`), message, signMessage)
				return res.status(403).end()
			}

			logger(Colors.magenta(`/Purchase-Guardian from ${ipaddress}`))
			logger(inspect(obj, false, 3, true))

			if (obj.data?.nodes !== obj.data?.publishKeys?.length) {
				logger(Colors.grey(`Router /Purchase-Guardian obj.data?.nodes !== obj.data?.publishKeys?.length Error!`), inspect(obj, false, 3, true))
				return res.status(403).end()
			}

			const txObj = await checkTx (obj.data.receiptTx, obj.data.tokenName)

			if (typeof txObj === 'boolean'|| !txObj?.tx1 || !txObj?.tx) {
				logger(Colors.grey(`Router /Purchase-Guardian txObj Error!`), inspect(txObj, false, 3, true))
				return res.status(403).end()
			}

			if (txObj.tx1.from.toLowerCase()!== obj.walletAddress) {
				logger(Colors.red(`Router /Purchase-Guardian txObj txObj.tx1.from [${txObj.tx1.from}] !== obj.walletAddress [${obj.walletAddress}]`))
				return res.status(403).end()
			}

			const networkName = getNetworkName(obj.data.tokenName)
			if (!networkName) {
				logger(Colors.red(`Router /Purchase-Guardian Can't get network Name from token name Error ${obj.data.tokenName}`))
				return res.status(403).end()
			}

			const CONET_receiveWallet = CONET_guardian_Address(obj.data.tokenName)
			
			const _checkTx = await txManager (obj.data.receiptTx, obj.data.tokenName, obj.walletAddress, obj.data.nodes, networkName, message, signMessage )

			if (!_checkTx) {
				logger(Colors.red(`Router /Purchase-Guardian tx [${obj.data.receiptTx}] laready used`))
				return res.status(403).end()
			}

			logger(Colors.blue(`${message}`))
			logger(Colors.blue(`${signMessage}`))
			
			if (txObj.tx1.to?.toLowerCase() !== CONET_receiveWallet) {
				if (getAssetERC20Address(obj.data.tokenName) !== txObj.tx1.to?.toLowerCase()) {
					logger(Colors.red(`Router /Purchase-Guardian ERC20 token address Error!`), inspect( txObj.tx1, false, 3, true))
					return res.status(403).end()
				}
				const erc20Result = checkErc20Tx(txObj.tx, CONET_receiveWallet, obj.walletAddress, obj.data.amount, obj.data.nodes, obj.data.tokenName)
				if (erc20Result === false) {
					logger(Colors.red(`Router /Purchase-Guardian  checkErc20Tx Error!`))
					return res.status(403).end()
				}
				const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
				if (!kk) {
					logger(Colors.red(`Router /Purchase-Guardian  checkValueOfGuardianPlan Error!`))
					return res.status(403).end()
				}
				const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
				const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, obj.data.amount, masterSetup.claimableAdmin, obj.data.publishKeys)
				return res.status(200).json(ret).end()
			}
			
			const value = txObj.tx1.value.toString()
			if (obj.data.amount !== value) {
				logger(Colors.red(`GuardianPlanPreCheck amount[${obj.data.amount}] !== tx.value [${value}] Error!`))
				return res.status(403).end()
			}

			const kk = await checkValueOfGuardianPlan(obj.data.nodes, obj.data.tokenName, obj.data.amount)
			if (!kk) {
				logger(Colors.red(`checkValueOfGuardianPlan Error!`))
				return res.status(403).end()
			}
			
			const referral = await checkReferralsV2_OnCONET_Holesky(obj.walletAddress)
			const ret = await returnGuardianPlanReferral(obj.data.nodes, referral, obj.walletAddress, obj.data.tokenName, obj.data.amount, masterSetup.claimableAdmin, obj.data.publishKeys)
			return res.status(200).json(ret).end()
		})

		router.post ('/leaderboardData',  async (req, res) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			let wallet: string
			try {
				wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /leaderboardData req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}


			

			const ret = {
				leaderboardData,
				free_referrals_rate: wallet ? free_referrals_rate_lists.filter(n => n.wallet.toLowerCase() === wallet.toLowerCase())[0]: '',
				guardians_referrals_rate: wallet ? guardians_referrals_rate_lists.filter(n => n.wallet.toLowerCase() === wallet.toLowerCase())[0]: ''
			}
			logger(Colors.grey(` ${ipaddress} GET /leaderboardData wallet [${wallet}] free_referrals_rate = [${ret.free_referrals_rate}] guardians_referrals_rate = [${ret.guardians_referrals_rate}]`))

			return res.status(200).json(ret).end()
		})

		router.all ('*', (req, res ) =>{
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

export default conet_dl_server