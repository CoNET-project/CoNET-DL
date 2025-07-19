/**
 * 			
 * */
import Express, { Router } from 'express'
import type {Response, Request } from 'express'
import { join } from 'node:path'
import { inspect } from 'node:util'
import Colors from 'colors/safe'
import Cluster from 'node:cluster'
import { masterSetup, getServerIPV4Address} from '../util/util'
import {logger} from '../util/logger'
import devplopABI from './develop.ABI.json'
import {ethers} from 'ethers'
import { writeFile} from 'node:fs/promises'
import {cntpAdminWallet, startEposhTransfer} from './utilNew'
import faucet_v3_ABI from './faucet_v3.abi.json'
import Ticket_ABI from './ticket.abi.json'
import CNTP_TicketManager_class  from '../util/CNTP_Transfer_pool'
import {abi as CONET_Referral_ABI} from '../util/conet-referral.json'
import rateABI from './conet-rate.json'
import { refferInit, initCNTP, startProcess} from '../util/initCancunCNTP'
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction, TransactionMessage, VersionedTransaction, TransactionSignature, TransactionConfirmationStatus, SignatureStatus } from "@solana/web3.js"
import { getOrCreateAssociatedTokenAccount,createBurnCheckedInstruction, createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token"
import SPClub_ABI from './SP_Club_ABI.json'
import Bs58 from 'bs58'
import passport_distributor_ABI from './passport_distributor-ABI.json'
import SPClubPointManagerABI from './SPClubPointManagerABI.json'
import SP_ABI from './CoNET_DEPIN-mainnet_SP-API.json'
import duplicateFactoryABI from './duplicateFactory.ABI.json'

const workerNumber = Cluster?.worker?.id ? `worker : ${Cluster.worker.id} ` : `${ Cluster?.isPrimary ? 'Cluster Master': 'Cluster unknow'}`

//	for production
	import {createServer} from 'node:http'


//	for debug
	// import {createServer as createServerForDebug} from 'node:http'

const packageFile = join (__dirname, '..', '..','package.json')
const packageJson = require ( packageFile )
const version = packageJson.version

const provideCONET = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')

export const checkGasPrice = 1550000
let startDailyPoolTranferProcess = false
let lastTransferTimeStamp = new Date().getTime()
const longestWaitingTimeForDaily = 1000 * 60 * 10
const longestWaitingTimeForTicket = 1000 * 60 * 5

//			getIpAddressFromForwardHeader(req.header(''))
const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}


process.on('unhandledRejection', (reason) => { throw reason; })


const MAX_TX_Waiting = 1000 * 60 * 3


const scAddr = '0x7859028f76f83B2d4d3af739367b5d5EEe4C7e33'.toLowerCase()
const sc = new ethers.Contract(scAddr, devplopABI, provideCONET)
const developWalletPool: Map<string, boolean> = new Map()

const getAllDevelopAddress = async () => {
	let ret: any []
	try {
		ret = await sc.getAllDevelopWallets()
		
	} catch (ex: any) {
		return logger(Colors.red(`getAllDevelopAddress call error!`), ex.message)
	}

	for (let i = 0; i < ret.length; i ++){
		logger(Colors.blue(`getAllDevelopAddress added ${(ret[i][0])} to developWalletPool`))
		developWalletPool.set (ret[i][0].toLowerCase(), ret[i][1])
	}
}

const developWalletListening = async (block: number) => {
	
	const blockTs = await provideCONET.getBlock(block)

	if (!blockTs?.transactions) {
        return 
    }

	for (let tx of blockTs.transactions) {

		const event = await provideCONET.getTransaction(tx)
		
		if ( event?.to?.toLowerCase() === scAddr) {
			await getAllDevelopAddress()
		}
		
	}
}

const stratlivenessV2 = async (eposh: number) => {

	await Promise.all([
		startProcess(),
		startFaucetProcess(),
		developWalletListening(eposh),
		processFreePassport()
	])
}



const faucetV3_cancun_Addr = `0x8433Fcab26d4840777c9e23dC13aCC0652eE9F90`
const ticketAddr = '0x92a033A02fA92169046B91232195D0E82b8017AB'
const conet_Referral_cancun = '0xbd67716ab31fc9691482a839117004497761D0b9'

const faucetWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[6], provideCONET)

const ticketWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[2], provideCONET)
const profileWallet = new ethers.Wallet(masterSetup.newFaucetAdmin[3], provideCONET)
export const ticket_contract = new ethers.Contract(ticketAddr, Ticket_ABI, ticketWallet)
const contract_Referral = new ethers.Contract(conet_Referral_cancun, CONET_Referral_ABI, provideCONET)
const faucet_v3_Contract = new ethers.Contract(faucetV3_cancun_Addr, faucet_v3_ABI, faucetWallet)
const FaucetProcessSCPOOL: ethers.Contract[] = [faucet_v3_Contract]
interface faucetRequest {
	wallet: string
	ipAddress: string
}

export const checkGasPriceFordailyTaskPool = 25000000

const startFaucetProcess = () => new Promise(async resolve => {
	if (!faucetWaitingPool.length) {
		return resolve (false)
	}
	const SC = FaucetProcessSCPOOL.shift()
	if (!SC) {
		return resolve (false)
	}


	const splited = faucetWaitingPool.slice(0, 50)
	faucetWaitingPool = faucetWaitingPool.slice(50)

	const ipAddress = splited.map(n => n.ipAddress)
	const wallet = splited.map(n => n.wallet)

	try {
		
		const tx = await SC.getFaucet(wallet, ipAddress)
		logger(`faucetWaitingPool start Faucet Total wallets ${wallet.length} Process tx = ${tx.hash} used manager wallet ${faucetWallet.address} `)

		await tx.wait()
	} catch (ex: any) {
		logger(`startFaucetProcess Error!`, ex.message)
	}
	FaucetProcessSCPOOL.push(SC)

	return resolve(true)
})

const spclub_addr = '0xe1949263B338D8c1eD7d4CbDE2026eb82DB78D3a'
const mainnet_rpc = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network')

const SPClub_admin_SC: ethers.Contract[] = []
for (let wallet of masterSetup.SPClub_admin_mainnet) {
	const _wallet = new ethers.Wallet(wallet, mainnet_rpc)
	const sc = new ethers.Contract(spclub_addr, SPClub_ABI, _wallet)
	SPClub_admin_SC.push(sc)
}


let faucetWaitingPool: faucetRequest[] = []

export const faucet_call =  (wallet: string, ipAddress: string) => {
	try {
		let _wallet = ethers.getAddress(wallet).toLowerCase()
		const obj = faucet_call_pool.get(_wallet)
		if (obj) {
			return false
		}
		faucet_call_pool.set(wallet, true)
		faucetWaitingPool.push({wallet, ipAddress})
		
	} catch (ex) {
		return false
	}

	return true
}

let currentEpoch = 0

const faucet_call_pool: Map<string, boolean> = new Map()


interface InodeEpochData {
	wallets: string[]
	users: string[]
}


const ReferralsMap: Map<string, string> = new Map()
const initV3Map: Map<string, boolean> = new Map()

interface iEPOCH_DATA {
	totalMiners: number
	minerRate: number
	totalUsrs: number
	epoch: number
}
let EPOCH_DATA: iEPOCH_DATA

const duplicateFactoryAddr = '0xAa32961a4756E7E45bEFC5c2740cc836A53fe661'
const duplicateFactoryManagsr = new ethers.Wallet(masterSetup.duplicateFactoryManager, mainnet_rpc)        //  0x23576F564C1467a42d565A3604585bEF1F499BB0
const duplicateFactoryPool = [new ethers.Contract(duplicateFactoryAddr, duplicateFactoryABI, duplicateFactoryManagsr)]

const duplicateProcessPool: {
    wallet: string
    hash: string
    res: any
    data: string
}[] = []

const duplicateProcess = async () => {
    const obj = duplicateProcessPool.shift()
    if (!obj) {
        return null
    }
    const SC = duplicateFactoryPool.shift()
    if (!SC) {
        duplicateProcessPool.unshift(obj)
        return null
    }
    try {
        const tx = await SC.createDuplicate(obj.wallet, obj.hash, obj.data)
        await tx.wait()
        const ret = await SC.duplicateList(obj.wallet)
        if (ret !== ethers.ZeroAddress) {
            obj.res.status(200).json({status: ret}).end()
        } else {
            obj.res.status(404).json({error: 'Duplicate not found'}).end()
        }
    } catch (ex: any) {
        logger(Colors.red(`duplicateProcess Error!`), ex.message)
        obj.res.status(403).json({
            error: 'Service temporarily unavailable'
        }).end()
        
        
    }
    duplicateFactoryPool.push(SC)
    duplicateProcess()
}

class conet_dl_server {

	private PORT = 8003
	private serverID = ''

	public CNTP_manager = new CNTP_TicketManager_class ([masterSetup.gameCNTPAdmin[0]], 1000)

	private initSetupData = async () => {
		this.serverID = getServerIPV4Address(false)[0]
		currentEpoch = await provideCONET.getBlockNumber()
		await getAllDevelopAddress()
		this.startServer()
		provideCONET.on ('block', async _block => {

			if (_block % 2) {
				return
			}

			currentEpoch = _block
			return stratlivenessV2(_block)
		})
		
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
			startEposhTransfer()
			return console.table([
                { 'CoNET DL': `version ${version} startup success ${ this.PORT } Work [${workerNumber}] server key [${cntpAdminWallet.address}]` }
            ])
		})
		
		
	}

	private router ( router: Router ) {

		router.post('/initV3',async (req: any, res: any) =>{
			
			let wallet: string
			try {
				wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`request /wallet req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}

			wallet = wallet.toLowerCase()
			let address = ReferralsMap.get (wallet)
			if (!address) {
				return res.status(200).json({err: 'no wallet'}).end()
			}
			const initWallet = initV3Map.get (address)
			if (initWallet) {
				return res.status(200).json({address}).end()
			}

			initV3Map.set(address, true)

			
			refferInit(wallet, '')
			initCNTP(wallet)
			return res.status(200).json({address}).end()

		})

		router.post ('/wallet',  async (req: any, res: any) =>{
			
			let wallet: string
			try {
				wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`request /wallet req.body ERROR!`), inspect(req.body, false,3, true))
				return res.status(403).end()
			}
			
			wallet = wallet.toLowerCase()
			let address = ReferralsMap.get (wallet)
			if (address) {
				return res.status(200).json({address}).end()
			}

			try {
				
				address = await contract_Referral.getReferrer(wallet)
			} catch (ex){
				logger(Colors.red(`contract.getReferrer Error!`))
				return res.status(200).json({}).end()
			}

			if (!address) {
				address = '0x0000000000000000000000000000000000000000'
			}

			address = address.toLowerCase()

			

			ReferralsMap.set(wallet, address)

			//logger(Colors.grey(`address = [${address}] ReferralsMap Total Length = [${ReferralsMap.size}]`))
			return res.status(200).json({address}).end()
		})
		
		router.post ('/conet-faucet', async (req: any, res: any) => {
			const wallet = req.body.walletAddress
			const ipaddress = req.body.ipaddress
			if (!wallet) {
				logger(Colors.red(`master conet-faucet req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}
			const initWallet = initV3Map.get (wallet)

			if (!initWallet) {

				initV3Map.set(wallet, true)
				refferInit(wallet, '')
				initCNTP(wallet)
			}

			
			const tx = await faucet_call(wallet.toLowerCase(), ipaddress)
			
			if (tx) {
				return res.status(200).json(tx).end()
			}
			return res.status(403).end()
		})

		router.post('/spclub', async (req: any, res: any) => {
			const obj:minerObj = req.body
			logger(`/spclub`, inspect(obj, false, 3, true))
			return SPClub(obj, res)
		})

		router.post('/freePassport', async (req: any, res: any) => {
			const obj: minerObj = req.body
			const isInpool = freePassportPool.get(obj.walletAddress)
			if (isInpool) {
				return res.status(200).json({}).end()
			}
			freePassportPool.set(obj.walletAddress, true)
			freePassportwaitingPool.push(obj.walletAddress)
            processFreePassport()
			logger(`processFreePassport!!`)
			return res.status(200).json({}).end()
		})

		router.post('/codeToClient', async (req: any, res: any) => {
			const obj: minerObj = req.body
			if (!obj?.solanaWallet||!obj?.hash) {
				return res.status(404).json({
					error: 'has no solanaWallet'
				}).end()
			}
            
			CodeToClientWaiting.push ({
				solana: obj.solanaWallet,
				res,
				to: obj.walletAddress,
				hash: obj.hash,
                uuid: obj.uuid
			})
			startCodeToClientProcess()
			logger(Colors.blue(`codeToClient start ${obj.walletAddress}`))
		})

        router.post('/duplicate', async (req: any, res: any) => {
			const obj: minerObj = req.body
            
			if (!obj?.hash) {
                logger(Colors.red(`duplicateProcess !obj?.hash Error!`), inspect(obj, false, 3, true))
                return res.status(404).json({
                    error: 'has no walletAddress or hash or data'
                }).end()
            }
            const duplicateProcessPoolObj = {
				res,
				wallet: obj.walletAddress,
				hash: obj.hash,
                data: obj?.data||''
			}

			duplicateProcessPool.push (duplicateProcessPoolObj)
            logger(Colors.blue(`duplicateProcess start ${inspect({wallet: duplicateProcessPoolObj.wallet, hash: duplicateProcessPoolObj.hash, data: duplicateProcessPoolObj.data}, false, 3, true)}`))
			duplicateProcess()
			
		})


		router.post ('/fx168HappyNewYear', async (req: any, res: any) => {
			const wallet = req.body.walletAddress
			if (!wallet) {
				logger(Colors.red(`master fx168HappyNewYear req.walletAddress is none Error! [${wallet}]`))
				return res.status(403).end()
			}
		})
		
		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${req.body, false, 3, true}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}


interface SPClubProcessObj {
	walletAddress: string
	solanaWallet: string
	referrer: string
	res: any
}


const SPClubProcess: SPClubProcessObj[] = []
const SPClub = (obj: minerObj, res: any) => {
	if (!obj?.solanaWallet||!obj?.referrer) {
		return res.status(403).json({error:'Data format error'}).end()
	}
	const objProcess: SPClubProcessObj = {
		walletAddress: obj.walletAddress,
		solanaWallet: obj.solanaWallet,
		referrer: obj?.referrer,
		res
	}
	SPClubProcess.push (objProcess)
	doing_SPClubProcess()
}

const doing_SPClubProcess = async () => {
	const obj = SPClubProcess.shift()
	if (!obj) {
		return
	}

	const SC = SPClub_admin_SC.shift()
	if (!SC) {
		SPClubProcess.unshift(obj)
		return setTimeout(() => {
			return doing_SPClubProcess()
		}, 1000)
	}
	try {
		//transferSP(obj.solanaWallet)
		const tx = await SC.mint(obj.walletAddress, obj.referrer, obj.solanaWallet)
		await tx.wait()
		obj.res.status(200).json({tx}).end()
		logger(Colors.blue(`doing_SPClubProcess success ${tx.hash}`))
	} catch (ex: any) {
		logger(Colors.red(`doing_SPClubProcess Error ${ex.message}`))
		obj.res.status(403).json({
			error: 'Service temporarily unavailable'
		}).end()

	}

	SPClub_admin_SC.push(SC)
	doing_SPClubProcess()
}

const SOLANA_CONNECTION = new Connection(
	"https://api.mainnet-beta.solana.com" // We only support mainnet.
)
const solana_account = masterSetup.solanaSPReword
const solana_account_privatekeyArray = Bs58.decode(solana_account)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)
const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'
const spDecimalPlaces = 6
const SPClubReward = "10"

const transferSP = async (to: string) => {
	let sourceAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        solana_account_privatekey,
        new PublicKey(SP_address),
        solana_account_privatekey.publicKey
    )
	let destinationAccount = await getOrCreateAssociatedTokenAccount(
        SOLANA_CONNECTION, 
        solana_account_privatekey,
        new PublicKey(SP_address),
        new PublicKey(to)
    )
	const tx = new Transaction()
	tx.add (createTransferInstruction(
        sourceAccount.address,
        destinationAccount.address,
        solana_account_privatekey.publicKey,
        ethers.parseUnits(SPClubReward, spDecimalPlaces)
    ))

	const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash('confirmed')
	tx.recentBlockhash = await latestBlockHash.blockhash
	try {
		const signature = await sendAndConfirmTransaction ( SOLANA_CONNECTION, tx,[solana_account_privatekey])
		logger(Colors.magenta(`transfer To SP Club member success ${signature}`))
	} catch (ex: any) {
		logger(Colors.magenta(`transfer To SP Club member Error${ex.message}`))
	}
}

const SPPaasportAdmin = new ethers.Wallet(masterSetup.forSPPassportFreeUser, mainnet_rpc)
const passport_distributor_addr = '0x40d64D88A86D6efb721042225B812379dc97bc89'
const SPManagermentSC = new ethers.Contract(passport_distributor_addr, passport_distributor_ABI, SPPaasportAdmin)
const freePassportPool: Map<string, boolean> = new Map()
let freePassportwaitingPool: string[] = []
const SPManagermentSCPool: ethers.Contract[] = []
SPManagermentSCPool.push(SPManagermentSC)

const SP_passport_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'
const SP_Passport_SC_readonly = new ethers.Contract(SP_passport_addr, SP_ABI, mainnet_rpc)

const SPPaasport_codeToClient = new ethers.Wallet(masterSetup.passport_codeToClient, mainnet_rpc)       //      0xed98Fa572Cb1Aa3C4e3FcBd3e75503cf565E56f0

const SPManagermentcodeToClient= new ethers.Contract(passport_distributor_addr, passport_distributor_ABI, SPPaasport_codeToClient)
const SPCodeToClient: ethers.Contract[] = [SPManagermentcodeToClient]
interface ICodeToClient {
	hash: string
	to: string
	solana: string
	res: any
    uuid: string
}

const CodeToClientWaiting: ICodeToClient[] = []

const processFreePassport = async () => {
	if (!freePassportwaitingPool.length) {
		return
	}

	const SC = SPManagermentSCPool.shift()
	const poolData = JSON.parse(JSON.stringify(freePassportwaitingPool))
	freePassportwaitingPool = []
	if (!SC) {
		return
	}
    
	try {
		const ts = await SC.freePassport(poolData)
		await ts.wait()
		logger(Colors.blue(`processFreePassport success ${ts.hash}`))
		freePassportwaitingPool = []
	} catch (ex: any) {
		freePassportwaitingPool = [...freePassportwaitingPool, ...poolData]
		logger(Colors.red(`processFreePassport Error!`), ex.message)
	}

	SPManagermentSCPool.push(SC)
}

const getNextNft = async (wallet: string, userInfo: [nfts:BigInt[], expires: BigInt[], expiresDays: BigInt[], premium:boolean[]]) => {

	for (let i = 0; i < userInfo[0].length; i ++) {
		const nft = parseInt(userInfo[0][i].toString())
		if (nft === 0) {
			continue
		}
		const expiresDay = parseInt(userInfo[2][i].toString())
		const _expires = parseInt(userInfo[1][i].toString())
		if (typeof _expires !== 'number') {
			return nft
		}
		const now = new Date().getTime()
		const expires = new Date(_expires*1000).getTime()
		if (Math.abs(now - expires) < ExpiresDays || expiresDay < 30) {
			continue
		}
		try {
			const _owner: bigint = await SP_Passport_SC_readonly.balanceOf(wallet, nft)
			const owner = parseInt(_owner.toString())
			if (owner > 0) {
				return nft
			}
		} catch (ex) {
			continue
		}
		return nft
	}
	return -1

}
const ExpiresDays = 1000 * 60 * 60 * 24 * 7
const activeProcess = async (wallet: string, SC: ethers.Contract) => {
	try {
		const [currentNFT, userInfo] = await Promise.all([
			SPManagermentcodeToClient.getCurrentPassport(wallet),
			SPManagermentcodeToClient.getUserInfo(wallet)
		])
		const currentID = parseInt(currentNFT[0])
		const _currentExpires = parseInt(currentNFT[1].toString())

		//		
		if (typeof _currentExpires !== 'number') {
			return
		}

		const now = new Date().getTime()
		const currentExpires = new Date(_currentExpires * 1000).getTime()

		// if (currentExpires > 0 && Math.abs(now - currentExpires) > ExpiresDays) {
		// 	return
		// }

		const nftID = await getNextNft(wallet, userInfo)
		if (nftID === currentID || nftID < 0) {
			return
		}

		const tx = await SC._changeActiveNFT(wallet, nftID)
		await tx.wait()

	} catch (ex: any) {
		logger(Colors.red(`activeProcess Error!, ${ex.message}`))
		return
	}
}

const CodeToClientV2_addr = `0x0e78F4f06B1F34cf5348361AA35e4Ec6460658bb`
const Contract = new ethers.Contract(CodeToClientV2_addr, SPClubPointManagerABI, SPPaasport_codeToClient)
const CodeToClientV2ContractPool = [Contract]

const checkCodeToClientV2 = (obj: ICodeToClient, nftID: string): Promise<boolean> => new Promise(async executor => {
    const SC = CodeToClientV2ContractPool.shift()
    let ret = false
    if (!SC) {
        return setTimeout(async () => {
            return executor(await checkCodeToClientV2(obj, nftID))
        }, 2000)
    }
    try {
        const detail: any = SC.redeemData(obj.hash)
        if (detail[0] !== ethers.ZeroAddress) {
            const tx = await SC.redeemPassport(obj.uuid, obj.to, obj.solana)
            logger(`checkCodeToClientV2 redeem ${obj.uuid} => ${obj.to} success ${tx.hash}`)
            obj.res.status(200).json({status: nftID}).end()
            await tx.wait()
            ret = true
        }
    } catch (ex:any) {
        logger(Colors.red(`checkCodeToClientV2 redeemData Error!`), ex.message)
    }
    CodeToClientV2ContractPool.push(SC)
    return ret
})


const startCodeToClientProcess = async () => {
	const obj = CodeToClientWaiting.shift()
	if (!obj) {
		return
	}
    const nft = parseInt((await SP_Passport_SC_readonly.currentID()).toString()) + 1
    const tryV2 = await checkCodeToClientV2 (obj, nft.toString())
    if (tryV2) {
        
        return startCodeToClientProcess ()
    }
	const SC = SPCodeToClient.shift()
	if (!SC) {
		CodeToClientWaiting.unshift(obj)
		return 
	}
	try {
		const tx = await SC._codeToClient(obj.hash, obj.to, obj.solana)
        
		obj.res.status(200).json({status: nft.toString()}).end()
        await tx.wait()
		await activeProcess(obj.to, SC)
	} catch(ex:any) {
		obj.res.status(404).json({error: 'Redeem Code Error!'}).end()
	}
	SPCodeToClient.push(SC)

	setTimeout(() => {
		startCodeToClientProcess()
	}, 1000)
}

export default conet_dl_server
