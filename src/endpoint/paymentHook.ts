/**
 *              return SP account = A8Vk2LsNqKktabs4xPY4YUmYxBoDqcTdxY5em4EQm8v1
 * 
 */

import Express, { Router } from 'express'
import {logger} from '../util/logger'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import { inspect } from 'node:util'
import Stripe from 'stripe'
import { masterSetup, checkSign} from '../util/util'
import { readFileSync } from 'node:fs'
import {ethers} from 'ethers'
import web2PaymentABI from './payment_PassportABI.json'
import SP_ABI from './CoNET_DEPIN-mainnet_SP-API.json'
import passport_distributor_ABI from './passport_distributor-ABI.json'
import { AppStoreServerAPIClient, Environment, GetTransactionHistoryVersion, ReceiptUtility, Order, ProductType, HistoryResponse, TransactionHistoryRequest, SignedDataVerifier } from "@apple/app-store-server-library"
import { getOrCreateAssociatedTokenAccount,createBurnCheckedInstruction, createTransferInstruction, getAssociatedTokenAddress, getAccount, transfer, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction } from "@solana/spl-token"
import Bs58 from 'bs58'
import { Connection, PublicKey, Keypair,Transaction, sendAndConfirmTransaction, SystemProgram, SendOptions, ComputeBudgetProgram, TransactionConfirmationStrategy } from "@solana/web3.js"
import {getSimulationComputeUnits} from "@solana-developers/helpers"
import SP_Oracle_ABI from './SP_OracleABI.json'
import {request as HTTPS_Request, RequestOptions} from 'node:https'
import GuardianOracle_ABI from './GuardianOracleABI.json'
import {v4} from 'uuid'
import { writeFileSync} from 'node:fs'
import ERC20_ABI from './cCNTPv7.json'
import SPClubPoint from './SPClub.ABI.json'
import ReferralsV3ABI from './ReferralsV3.json'
import SPClubPointManagerABI from './SPClubPointManagerABI.json'
import GuardianNodesV2ABI from './CGPNv7New.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {createMessage, encrypt, enums, readKey,generateKey, readPrivateKey, decryptKey} from 'openpgp'
import {mapLimit} from 'async'
import CoNET_DePIN_SpClub_ABI from './CoNET_DePIN-SPClub.ABI.json'
import SPClub_Airdrop_ABI from './AirDropForSP.ABI.json'
import { balanceTron, ethToTronAddress } from './tron'
import {exec} from 'node:child_process'
import {join} from 'node:path'
import SPGlodMemberABI from './SPGlodMember_ABI.json'
import nacl from 'tweetnacl'
import duplicateFactory_ABI from './duplicateFactory.ABI.json'
import {getUSDT2Sol_Price, findAndVESTING_ID} from './vestingPda'
import ChannelPartnersABI from './ChannelPartnersABI.json'
import initReferralsV3ABI from './initReferralsV3ABI.json'


const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress||typeof ipaddress !== 'string') {
		return ''
	}
	return ipaddress
}

const issuerId = masterSetup.apple.apple_issuerId
const keyId = masterSetup.apple.keyId
const bundleId = "com.fx168.CoNETVPN1.CoNETVPN1"
const filePath = masterSetup.apple.encodedKeyPath
const appleRoot = masterSetup.apple.appleRootCA
const sp_team = '2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q'
const fx168PublicKey = `0xB83A30169F696fc3B997F87eAfe85894235f7d77`.toLowerCase()
const SPClubAddress = `0x9D27BEdb1d093F38726F60551CfefaD83fA838a2`
const ReferralsV3Address = '0xE235f3b481270F5DF2362c25FF5ED8Bdc834DcE9'

const cryptoPayWallet = ethers.Wallet.fromPhrase(masterSetup.cryptoPayWallet)
const environment = Environment.SANDBOX

type wallets = {
	walletAddress: string
	solanaWallet: string
}

type walletsProcess = {
	walletAddress: string
	solanaWallet: string
	expiresDays: number
	total: number
	hash: string
    hdWallet?: string
}

const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const web2_wallet = new ethers.Wallet(masterSetup.web2_PaymentPassport, CONET_MAINNET)
const PaymentPassport_addr = '0x3F7D3F23D0A00C60f5231De78094bD7409C72AF9'
const payment_SC = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, web2_wallet)
const payment_SC_readOnly = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, CONET_MAINNET)
const Payment_SCPool: ethers.Contract[] = [payment_SC]
const oracleSC_addr = '0xE9922F900Eef37635aF06e87708545ffD9C3aa99'
const oracleSC = new ethers.Contract(oracleSC_addr, GuardianOracle_ABI, CONET_MAINNET)

const payment_waiting_status: Map<string, number|string> = new Map()
const mintPassportPool: walletsProcess[]  = []

const HTTPS_PostTohost_JSON = async (host: string, path: string, obj: any): Promise<boolean|null> => new Promise(async resolve => {
    
    const option: RequestOptions = {
        path,
        host: host,
        port: 443,
        method: 'POST',
        protocol: 'https:',
        headers: {
            'Content-Type': 'application/json'
        },
        rejectUnauthorized:false
    }
    
    const req = HTTPS_Request (option, res => {
        if (res.statusCode !== 200) {
            return resolve (false)
        }
        let data = ''
        res.on('data', _data => {
            data += _data.toString()
        })
        
        res.once('end', () => {
            if (!data) {
                return resolve (true)
            }
            try {
                const ret = JSON.parse(data)
                return resolve (ret)
            } catch (ex) {
                return resolve (null)
            }
        })
        res.once('error', err => {
            logger(`HTTPS_PostTohost_JSON on Error`, err.message)
        })

    })

    req.once('error', err => {
        logger(`HTTPS_PostTohost_JSON HTTPS_Request on Error`, err.message)
        return resolve (null) 
    })

    req.end(JSON.stringify(obj))
})

const oracle = {
    bnb: 0,
    eth: 0
}
const oracolDeman = async () => {
    await oracolPrice()
    setTimeout(() => {
        oracolDeman()
    }, 15 * 1000 * 60)
}
let currentBlock = 0

const CodeToClientV2_addr = `0x0e78F4f06B1F34cf5348361AA35e4Ec6460658bb`
const CodeToClientV2_readonly = new ethers.Contract(CodeToClientV2_addr, SPClubPointManagerABI, CONET_MAINNET)

const daemondStart = async () => {
    
    currentBlock = await CONET_MAINNET.getBlockNumber()
    logger(Colors.magenta(`CoNET DePIN passport airdrop daemon Start from block [${currentBlock}]`))
    CONET_MAINNET.on('block', async block => {
        if (block > currentBlock) {
            currentBlock = block
            
        }
        
    })
}

const oracolPrice = async () => {
    const assets = ['bnb', 'eth']
	const process: any[] = []
	assets.forEach(n =>{
		process.push (oracleSC.GuardianPrice(n))
	})

	const price = await Promise.all(process)
    const bnb = ethers.formatEther(price[0])
    const eth = ethers.formatEther(price[1])

    oracle.bnb = parseFloat(bnb)
    oracle.eth = parseFloat(eth)
}

const monitorRewardWaitingMins = 15

const SPClub_airdrop_addr = '0x3fcbbBDA3F548E07Af6Ea3990945FB60416707d8'
const SPClub_Airdrop_manager = new ethers.Wallet(masterSetup.SP_Club_Airdrop, CONET_MAINNET)        //      0xbFD582466561155F56430E8f55f473a9696afEA9
const SPClub_Airdrop_Contract_pool = [new ethers.Contract(SPClub_airdrop_addr, SPClub_Airdrop_ABI, SPClub_Airdrop_manager)]


const SPGoldMember_Addr = '0x646dD90Da8f683fE80C0eAE251a23524afB3d926'
const SPGlodProcessSc = [new ethers.Contract(SPGoldMember_Addr, SPGlodMemberABI, SPClub_Airdrop_manager)]

const SPClub_AirdropPool: {
    walletAddress: string
    solanaWallet: string
    ipaddress: string
    amount: number
    referrer?: string
    referrerSolana?: string
}[] = []



const SPClub_AirdropProcess = async () => {
    const obj = SPClub_AirdropPool.shift()
    if (!obj) {
        return
    }
    const SC = SPClub_Airdrop_Contract_pool.shift()
    if (!SC) {
        SPClub_AirdropPool.unshift(obj)
        return setTimeout(async () => {
            await SPClub_AirdropProcess()
        }, 1000)
    }
    try {

        const tx = obj?.referrer ? await SC.airdropForReferees(obj.solanaWallet, obj.walletAddress, obj.ipaddress, obj.referrer)  : await SC.airdropForSP(obj.solanaWallet, obj.walletAddress, obj.ipaddress)
        await tx.wait ()
        if (obj.amount > 0) {
            await returnSP(obj.solanaWallet, obj.amount.toString(), '', masterSetup.SP_Club_Airdrop_solana)
            if (obj?.referrerSolana) {
                await returnSP(obj.referrerSolana, obj.amount.toString(), '', masterSetup.SP_Club_Airdrop_solana)
            }
            
        }
        

    } catch (ex: any) {
        logger(`SPClub_AirdropProcess Error`, ex.message)
    }

    SPClub_Airdrop_Contract_pool.push(SC)
    setTimeout(() => {
        SPClub_AirdropProcess ()
    }, 1000)

}

const checkAirDropForSPReffers = async (wallet: string, solana: string, ipaddress: string, reffer: string): Promise<boolean> => {
    if (wallet !== reffer) {
        try {
            const tx = await SPClub_Airdrop_Contract_pool[0].isReadyForReferees (solana, wallet, ipaddress)
            return tx
        } catch (ex: any) {
            console.log (`checkAirDropForSPReffers Error`, ex.message)
            
        }
    }
    
    return false
}

const checkAirDropForSP = async (wallet: string, solana: string, ipaddress: string): Promise<boolean> => {
    try {
        
        const tx = await SPClub_Airdrop_Contract_pool[0].isReadyForSP (solana, wallet, ipaddress)
        return tx
    } catch (ex: any) {
        console.log (`checkAirDropForSP Error`, ex.message)
        return false
    }
}

const reffAddressList = [
    '0x915Ab24b3bEb4B004ED437e649bdFd4e0665B45B'.toLowerCase(),
    '0x8eA27BCd88f3ff97f089ECB9236edfC767d3e268'.toLowerCase(),
    '0x0162443c477BD116359444cF7260a235AC8f5f2c'.toLowerCase(),
    '0xf044f270860c9e2aa76537EFc19CB5072D2600B5'.toLowerCase()
]

const reffSOlanaAddressList = [
    '',
    'CLNTomz3Q34TWa4dampqoRTDgDkTAb1ENsHtX4B9nxpR',
    '3gp7V8HDiPouQEjHhdsqhooQhTQNfSL8BGMPWnT22Y3R',
    '8DgvFpNUW8ZLx8aoUYuYe38JaYK96pHz9r3upPufY7Lf'
]

const storeRedeem = async (redeemCode: string, address: string, tx: string) => {
    const date = new Date()
    const obj = {address,  redeemCode, tx}
    const data = JSON.stringify(obj)
    const fileName = `${redeemPaymentPath}${redeemCode}-${date.toJSON()}`
    await writeFileSync (fileName, data, 'utf8')
}

const checkPrice: (_amount: string) => Promise<planStruct> = async (_amount: string) => new Promise( async resolve=>{
    await getOracle()

    logger(inspect(oracleData, false, 3, true))
    const amount = parseFloat(_amount)
    if (oracleData.data == null) {
        resolve('0')
        return logger(`checkPrice oracleData?.data is NULL Error!`)
    }
    // check sp9999
    const sp249 = parseFloat(oracleData.data.sp249)
    const sp999 = parseFloat(oracleData.data.sp999)
    const sp2499 = parseFloat(oracleData.data.sp2499)
    const sp9999 = parseFloat(oracleData.data.sp9999)
    const sp31 = sp2499 * 31 / 24.99
    
    if (Math.abs(amount - sp31) < sp31 * 0.05) {
        return resolve('3100')
    }

    if (Math.abs(amount - sp2499) < sp2499 * 0.05) {
        return resolve('2400')
    }

    if (Math.abs(amount - sp249) < sp249 * 0.05) {
        return resolve('299')
    }

    return resolve('0')
})

const checkSolanaPayment = (solanaTx: string, walletAddress: string, _solanaWallet: string, waiting = false): Promise<boolean> => new Promise(async executor => {

    //		from: J3qsMcDnE1fSmWLd1WssMBE5wX77kyLpyUxckf73w9Cs
    //		to: 2UbwygKpWguH6miUbDro8SNYKdA66qXGdqqvD6diuw3q
    const connect = masterSetup.solana_rpc

    // const connect = getRandomNode()
    const SOLANA_CONNECTION = new Connection(connect, {
        commitment: "confirmed",
        disableRetryOnRateLimit: false,
    })

    let tx

    try {
        tx = await SOLANA_CONNECTION.getTransaction(solanaTx, {maxSupportedTransactionVersion: 0})
    } catch (ex: any) {
        logger(`checkSolanaPayment SOLANA_CONNECTION.getTransaction Error`, ex.message)
        return executor (false)
    }
    
    const meta = tx?.meta
    if (meta) {
        logger(`checkSolanaPayment meta pass 1`)
        const postTokenBalances = meta.postTokenBalances
        const preTokenBalances = meta.preTokenBalances

        if (preTokenBalances?.length == 2 && postTokenBalances?.length == 2) {
            const solanaWallet = postTokenBalances[0].owner
             logger(`checkSolanaPayment index preTokenBalances?.length == 2 && postTokenBalances?.length == 2`)
            if (solanaWallet === _solanaWallet && preTokenBalances[0].mint === SP_address && (preTokenBalances[0].owner === sp_team || preTokenBalances[1].owner === sp_team)) {
                const index = preTokenBalances[0].owner === sp_team ? 0 : 1
                logger(`checkSolanaPayment index ${index}`)
                if (postTokenBalances[index].uiTokenAmount && preTokenBalances[index].uiTokenAmount) {
                    const preAmount = parseFloat(preTokenBalances[index].uiTokenAmount.uiAmount ? preTokenBalances[index].uiTokenAmount.uiAmount.toString() : "0")
                    const postAmount = parseFloat( postTokenBalances[index].uiTokenAmount.uiAmount ? postTokenBalances[index].uiTokenAmount.uiAmount.toString() : "0")
                    const _amount = postAmount - preAmount

                    logger(Colors.blue(`transferAmount = ${_amount}`))
                    const [hash, nftType] = await Promise.all([
                        checkHash(solanaTx),
                        checkPrice(_amount.toFixed(4))
                    ])
                    
                    if (nftType === '0'|| !hash ) {
                        logger(Colors.magenta(`checkSolanaPayment Pay ${solanaTx} $SP${_amount} nftType=${nftType} hash=${hash} not correct f${_amount}  [${solanaWallet}] ethWallet ${walletAddress}`))
                        return executor(false)
                        // const amount = parseFloat(_amount.toFixed(4)) * 0.97
                        // if (amount > 0.1) {
                        //     returnPool.push ({
                        //         from, amount: amount.toFixed(4)
                        //     })

                        //     returnSP()
                        // }
                        
                        // process_SP_purchase__Failed()
                        
                        // return logger(Colors.magenta(`check = false back amount! ${amount} to address [${from}]`))
                    }
                    await execVesting(nftType, walletAddress, _solanaWallet, '', solanaTx)
                    
                    logger(Colors.magenta(`Purchase ${walletAddress} NFT ${nftType}`))
                    executor(true)
                    return logger(Colors.magenta(`NFT success! for ${solanaTx} [${walletAddress}]`))
                }

                logger(inspect(preTokenBalances, false, 3, true))
                logger(inspect(postTokenBalances, false, 3, true))
                executor(false)
                return logger(Colors.red(`NFT Errot! from ${solanaWallet} postTokenBalances[1].uiTokenAmount && preTokenBalances[1].uiTokenAmount [${postTokenBalances[1].uiTokenAmount && preTokenBalances[1].uiTokenAmount}]`))

            }

            logger(inspect(preTokenBalances, false, 3, true))
            logger(inspect(postTokenBalances, false, 3, true))
            executor(false)
            return logger(Colors.magenta(`NFT Errot! from ${solanaWallet} preTokenBalances[0].mint === SP_address ${preTokenBalances[0].mint === SP_address} preTokenBalances[0].owner === sp_team ${preTokenBalances[0].owner === sp_team}`))
        }

        logger(Colors.magenta(`NFT Errot! preTokenBalances?.length ${ preTokenBalances?.length} postTokenBalances?.length ${postTokenBalances?.length} Error!`))
       
    }
    
    logger(`checkSolanaPayment meta error!`)
    logger(inspect(tx, false, 3, true))
    if (!waiting) {
        await new Promise(_executor => setTimeout(()=> _executor(true), 5000))
        return executor (await checkSolanaPayment(solanaTx, walletAddress, _solanaWallet, true))
    }
    executor(false)

})

const getReferrer = async (walletAddress: string, reffer=ethers.ZeroAddress): Promise<string> => {
    
    try {
        const [ reffers] = await Promise.all([
            SPDuplicateFactoryContract.getReferrer(walletAddress),
        ])

        if (reffers !== ethers.ZeroAddress) {
            return reffers
        }
    } catch (ex: any) {
        logger(`getReferrer Error`, ex.message)
        return ''
    }
    return ethers.ZeroAddress
    
}


interface applePay{
	total: string
	publicKey: string
	Solana: string
	transactionId: string
	productId: string
}

const StripePlan = (price: string): planStruct => {
    switch(price) {
        case '329' : {
            return '299'
        }
        case '2749': {
            return '2400'
        }
        case '3410': {
            return '3100'
        }
        case '2860': {
            return '2860'
        }
        default: {
            return '0'
        }
    }
}

const checkPurchasePassport = async (obj: minerObj): Promise<boolean> => {
    const _sign: string = obj.data
    if (!_sign || !obj.solanaWallet) {
        logger(`checkPurchasePassport Error 1`)
        return false
    }

    const solanaWalletPublicKey = new PublicKey(obj.solanaWallet)
    const encodedMessage = new TextEncoder().encode(obj.walletAddress)
    const signature = Bs58.decode(_sign)
    const isValid = nacl.sign.detached.verify(encodedMessage, signature, solanaWalletPublicKey.toBytes())


    if (!isValid||!obj.hash) {
        logger(`/purchasePassportBySP isValid Error! ${isValid}`)
        return false
    }

    logger(`checkPurchasePassport pass1`)
    logger(inspect(obj, false, 3, true))

    const kkk = await checkSolanaPayment (obj.hash, obj.walletAddress, obj.solanaWallet)
    return kkk
    
}

class conet_dl_server {

	private PORT = 8005
	private stripe = new Stripe(masterSetup.stripe_SecretKey)
	private initSetupData = async () => {
        await getAllNodes()
		this.startServer()
        getOracle()
        oracolDeman()
        daemondStart()
	}

	constructor () {
		this.initSetupData ()
	}

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
		const Cors = require('cors')
		// app.use(Cors ())
        app.use((err: any, req: any, res: any, next: any) => {
            if (err) {
                console.error(err)
                return res.status(400).send({ status: 400, message: err.message }); // Bad request
            }
        })
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
        router.post('/applePayUser', async (req: any, res: any) => {
            const data: applePay = req.body

            logger(`/applePayUser `, inspect(data, false, 3, true))

            if (!data?.Solana || !data?.publicKey ||!data?.productId ||! data?.transactionId) {
                logger(`/applePayUser unsupport data format Error!`)
                return res.status(403).json({error: 'unsupport data format!'}).end()
            }
            
            await checkAppleReceipt(data.publicKey.toLowerCase(), data.Solana, data.transactionId, data.productId)
           
			return res.status(200).json({received: true}).end()
        })

		router.post('/paypal_fx168', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)

			//		body === { message, signMessage}
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /paypal_fx168 req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			//		
			const obj = checkSign (message, signMessage)

			//		obj === {walletAddress: '168 public key', data {walletAddress: 'client public KEY', solanaWallet: 'client solana public key'}}

			const data = obj?.data
			if (!obj || obj?.walletAddress !== fx168PublicKey || !data?.walletAddress || !data?.solanaWallet || (data?.type !== '1' && data?.type !== '2') || !data?.hash ) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}

			//	發行NFT 進程
			//

			payment_waiting_status.set(data.walletAddress, 1)

			mintPassportPool.push({
				walletAddress: data.walletAddress,
				solanaWallet:data.solanaWallet,
				expiresDays: data?.type === '1'?  31: 372,
				total: 1,
				hash: data.hash
			})
			
            SPClub_Point_Process.push({
                expiresDayes: data?.type === '1'?  31: 372,
                wallet: data.walletAddress,
                referee: await getReferrer(data.walletAddress)
            })
            process_SPClub_Poing_Process()
            mintPassport()
            
			res.status(200).json({success: true})

		})

		router.post('/stripeHook', Express.raw({type: 'application/json'}), async (req: any, res: any) => {
			let event = req.body
			switch (event.type) {
				case 'invoice.payment_succeeded': {
                    logger(`invoice.payment_succeeded`)
					const paymentIntent: Stripe.Invoice = event.data.object
                    
                    logger(inspect(event.data, false, 4, true))
                    searchInvoices (this.stripe, paymentIntent.id)
                    
                    
					break;
				}

                case 'checkout.session.completed': {
                    logger(`checkout.session.completed`)
                    const session = event.data.object
                    if (!session.subscription) {
                        searchSession(this.stripe, session.id)
                    }
                
                    break;
                }

				default: {
					// Unexpected event type
					console.log(`Unhandled event type ${event.type}.`)
					logger(inspect(event, false, 3, true))
				}
				
			}
			
			res.status(200).json({received: true}).end()
		})

		router.post('/payment_stripe', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger(Colors.magenta(`/payment_stripe`))
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			
			
			const obj = checkSign (message, signMessage)
			const price = obj?.price
            
			if (!obj || !obj?.walletAddress||!obj?.solanaWallet ||!price) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
            const plan = StripePlan(price)
            

            //logger(Colors.magenta(`/payment_stripe`), inspect(obj, false, 3, true))
			
            if (plan === '0') {
                logger(`payment_stripe price [${price}] got zoro plan ${plan} Error!`)
                return res.status(402).json({error: 'No necessary parameters'}).end()
            }

			const url = await makePaymentLink(this.stripe, obj.walletAddress, obj.solanaWallet, plan)
            if (!url) {
                logger(`payment_stripe makePaymentLink  got null URL Error!`)
                return res.status(402).json({error: 'No necessary parameters'}).end()
            }
            
			payment_waiting_status.set(obj.walletAddress.toLowerCase(), 1)
			return res.status(200).json({url}).end()
		})

		router.post('/payment_stripe_waiting', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /payment_stripe_waiting req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			
			const obj = checkSign (message, signMessage)
			
			if (!obj || !obj?.walletAddress) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			const wallet = obj.walletAddress.toLowerCase()
			const status = payment_waiting_status.get(wallet)
            waitingList.set(wallet, 0)

			if (!status) {
				logger(`/payment_stripe_waiting ${obj.walletAddress} got unknow status! ${status}`)
				return res.status(402).json({error: `No ${obj.walletAddress} status`}).end()
			}

            payment_waiting_status.delete(wallet)
			logger(`/payment_stripe_waiting ${obj.walletAddress} got ${status}`)

			return res.status(200).json({ status }).end()
		})

        router.post('/codeToClient', async (req: any, res: any) => {
            const ipaddress = getIpAddressFromForwardHeader(req)
            let message, signMessage
            try {
                message = req.body.message
                signMessage = req.body.signMessage

            } catch (ex) {
                logger (Colors.grey(`${ipaddress} request /codeToClient req.body ERROR!`), inspect(req.body))
                return res.status(404).end()
            }
            
            const obj = checkSign (message, signMessage)
            if ( !obj?.walletAddress|| !obj?.uuid || !obj?.solanaWallet) {
                
                logger (Colors.grey(`Router /codeToClient checkSignObj obj Error! !obj ${!obj} !obj?.data ${!obj?.data}`))
                logger(inspect(obj, false, 3, true))
                return res.status(404).json({
                    error: "SignObj Error!"
                }).end()
            }
            obj.hash =ethers.solidityPackedKeccak256(['string'], [obj.uuid])

            let goldRedeem, padID
            try {
                [goldRedeem, padID] = await Promise.all([
                    SPGlodProcessSc[0].redeemData_expiresDayes(obj.hash),
                    payment_SC_readOnly.getPayID(obj.uuid)
                ])
                
                
                goldRedeem = parseInt(goldRedeem.toString())
                logger(`/codeToClient Redeem Code [${obj.uuid}] hash=[${obj.hash}] goldRedeem = ${goldRedeem} padID = ${padID} ${obj.walletAddress}`)

                if ( goldRedeem === 0 || padID ) {
                    logger(`/codeToClient Redeem Code Error! goldRedeem = ${goldRedeem} padID = ${padID} ${obj.walletAddress}`)
                    return res.status(400).json({
                        error: "Redeem Code Error!"
                    }).end()
                }
                

            } catch (ex: any) {
                logger(`/codeToClient catch ex`, ex.message)
                return res.status(400).json({
                    error: "Unavailable!"
                }).end()
            }

            payment_waiting_status.set(obj.walletAddress, 1)


            const plan: planStruct = goldRedeem < 31 ? '0' : goldRedeem > 370 ? "3100" : goldRedeem > 365 ? '2400' : '299'
            execVesting(plan, obj.walletAddress, obj.solanaWallet, obj.walletAddress, '', obj.uuid)


            return res.status(200).json({
                status: "1"
            }).end()

            
        })

        router.post('/applePay', async (req: any, res: any) => {
            const body = req.body
            logger(`applePay!`)
			if (body.signedPayload) {
				await appleNotification(body.signedPayload)
			}

            res.status(200).json({received: true}).end()
        })

        router.post('/applePayUserRecover', async (req: any, res: any) => {
            const data = req.body

            logger(`/applePayUserRecover `, inspect(data, false, 3, true))

            if (!data?.solanaWallet || !data?.walletAddress || !data?.receipt) {
                logger(`/applePayUserRecover unsupport data format Error!`)
                return res.status(403).json({error: 'unsupport data format!'}).end()
            }
            
            const kk = await appleReceipt(data.receipt, data.walletAddress, data.solanaWallet)
            if (!kk) {
                logger(`/applePayUserRecover unsupport data format Error! appleReceipt return false!`)
                return res.status(403).json({error: 'unsupport data format!'}).end()
            }
           
			return res.status(200).json({received: true}).end()
        })

		router.post('/cryptoPay', async (req: any, res: any) => {

            const ipaddress = getIpAddressFromForwardHeader(req)
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			logger(Colors.magenta(`/cryptoPay`), message, signMessage)
			
			const obj = checkSign (message, signMessage)

            const error = JSON.stringify({error: 'Format error!'})
            
            if (!obj||!obj?.solanaWallet||!obj?.data ||! obj.data?.cryptoName|| ! obj.data?.plan || obj.data.plan === '0') {
                logger(`/cryptoPay data format error!`)
                return res.status(200).json({error}).end()
            }

            const cryptoName = obj.data.cryptoName
            const planName: planStruct = obj.data.plan
           
            const plan = await getPriceFromCryptoName (cryptoName, planName)

            if (plan === 0) {
                logger(`/cryptoPay  getPriceFromCryptoName !plan error!`)
                logger(inspect(obj.data, false, 3, true))
                return res.status(200).json({error}).end()
            }

            const waitingAddress = await listenTransfer(plan, cryptoName, planName, obj.walletAddress, obj.solanaWallet)

            if (!waitingAddress) {
                logger(inspect(obj.data, false, 3, true))
                logger(`/cryptoPay plan listenTransfer !waitingAddress error!`)
                return res.status(200).json({error}).end()
            }

            return res.status(200).json({success: true, wallet: waitingAddress, transferNumber: plan.toString()}).end()
            
        })

		router.post('/spReward', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			logger(Colors.magenta(`/spReward`), message, signMessage)
			
			const obj = checkSign (message, signMessage)

			const price = obj?.price
			if (!obj || !obj?.walletAddress|| !obj?.solanaWallet) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			const solana = obj.solanaWallet
			const balance = await spRewardCheck(obj.walletAddress, obj.solanaWallet)

            if (!balance) {
                return res.status(403).json({error: 'Not available'}).end()
            }

            payment_waiting_status.set(obj.walletAddress, 1)

            reword_pool.push({
                wallet: obj.walletAddress,
                solana,
                balance: ethers.parseUnits(balance.toString(), spDecimalPlaces)
            })

            sp_reword_process()
            setTimeout(() => {
                monitorReward(obj.walletAddress, solana, balance, 0)
            }, 1000 * 60 * monitorRewardWaitingMins * Math.random())

			return res.status(200).json({success: true}).end()
		})

        // router.post ('/getAirDropForSP', async (req: any, res: any) => {
        //     let ipaddress = getIpAddressFromForwardHeader(req)
		// 	logger(Colors.magenta(`/getAirDropForSP`))
		// 	let message, signMessage
		// 	try {
		// 		message = req.body.message
		// 		signMessage = req.body.signMessage

		// 	} catch (ex) {
		// 		logger (Colors.grey(`${ipaddress} request /getAirDropForSP req.body ERROR!`), inspect(req.body))
		// 		return res.status(404).json({
		// 			error: 'message & signMessage Object Error!'
		// 		}).end()
		// 	}

			
		// 	const obj = checkSign (message, signMessage)
	
		// 	if (!obj || !obj?.walletAddress || !obj?.solanaWallet || !ipaddress ) {
        //         logger (Colors.grey(`Router /airDropForSP checkSignObj obj Error! !obj ${!obj} !ipaddress ${!ipaddress}`))
        //         logger(inspect(obj, false, 3, true))

        //         return res.status(403).json({
        //             error: 'message & signMessage Object walletAddress or solanaWallet Error!'
        //         }).end()
        //     }
        //     if (ipaddress === '73.189.157.190') {
        //         ipaddress = v4()
        //     }
        //     const key = new PublicKey( obj.solanaWallet).toBase58()


        //     const [status, balance] = await Promise.all([
        //         checkAirDropForSP(obj.walletAddress, obj.solanaWallet, ipaddress),
        //         checkIsHoldSP(obj.solanaWallet)
        //     ])

        //     if (!status||!key) {
        //         return res.status(404).json({
		// 			error: 'Unavailable!'
		// 		}).end()
        //     }

        //     const amount = balance ? 1000 * 10 ** spDecimalPlaces : 100 * 10 ** spDecimalPlaces
        //     obj.ipAddress = ipaddress
        //     SPClub_AirdropPool.push({
        //         walletAddress: obj.walletAddress,
        //         solanaWallet: obj.solanaWallet,
        //         ipaddress,
        //         amount
        //     })

        //     logger(inspect(obj, false, 3, true))
        //     SPClub_AirdropProcess()
        //     return res.status(200).json({
        //         status: true,
        //         amount: balance ? 1000 : 100
        //     }).end()

        // })

        router.post ('/getAirDropForSPReff', async (req: any, res: any) => {
            let ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /getAirDropForSPReff req.body ERROR!`), inspect(req.body))
				return res.status(404).json({
					error: 'message & signMessage Object Error!'
				}).end()
			}

			
			const obj = checkSign (message, signMessage)
            
			if ( !obj?.referrer || !obj?.walletAddress || obj.referrer === ethers.ZeroAddress || obj.walletAddress === ethers.ZeroAddress) {
                logger (Colors.grey(`Router /getAirDropForSPReff checkSignObj obj Error! !obj ${!obj} !ipaddress ${!ipaddress}`))
                logger(inspect(obj, false, 3, true))

                return res.status(403).json({
                    error: 'message & signMessage Object walletAddress or solanaWallet Error!'
                }).end()
            }

            const referrer = obj.referrer.toLowerCase()
            if (referrer === obj.walletAddress) {
                
                return res.status(403).json({
                    error: 'Referrer can not be yourself!'
                }).end()
            }

            let walletAddressSC = '', referrerSC = ''
            try {
                const [isreferrerCode, iswalletAddressCode, reCode, waCode] = await Promise.all([
                    CONET_MAINNET.getCode(referrer),
                    CONET_MAINNET.getCode(obj.walletAddress),
                    SPDuplicateFactoryContract.getDuplicateAddress(referrer),
                    SPDuplicateFactoryContract.getDuplicateAddress(obj.walletAddress)
                ])
                referrerSC = isreferrerCode === '0x' ? (reCode !== ethers.ZeroAddress ? reCode : '') : referrer
                walletAddressSC = iswalletAddressCode === '0x' ? (waCode !== ethers.ZeroAddress ? waCode : '') : obj.walletAddress

            } catch (ex) {
                return res.status(404).json({
                    error: 'Service unreachable!'
                }).end()
            }

            if (!walletAddressSC || !referrerSC) {
                return res.status(403).json({
                    error: 'walletAddress or referrer Error!'
                }).end()
            }
            
            const isReff = await getReferrer(walletAddressSC, referrerSC)

            if (isReff !== ethers.ZeroAddress) {
                return res.status(403).json({
                    error: 'Referrer Already exists!'
                }).end()
            }
            

            addReferralsPool.push({
                wallet: walletAddressSC,
                referrer: referrerSC
            })
            
            addReferralsProcess()
            
            // if (ipaddress === '73.189.157.190') {
            //     ipaddress = v4()
            // }
            
            

            // const key = new PublicKey( obj.solanaWallet).toBase58()

            // if (!status||!key) {
            //     return res.status(404).json({
			// 		error: 'Unavailable!'
			// 	}).end()
            // }
            // const isWhiteList = reffAddressList.findIndex(n => n === referrer)
            // obj.ipAddress = ipaddress

            // const amount = isWhiteList < 0 ? 0 : balance ? 1000 * 10 ** spDecimalPlaces : 100 * 10 ** spDecimalPlaces
            

            // SPClub_AirdropPool.push({
            //     walletAddress: obj.walletAddress,
            //     solanaWallet: obj.solanaWallet,
            //     ipaddress,
            //     amount,
            //     referrer: obj.referrer,
            //     referrerSolana: reffSOlanaAddressList[isWhiteList]
            // })

            // logger(inspect(obj, false, 3, true))
            // SPClub_AirdropProcess()

            return res.status(200).json({
                status: true,
                amount: 0
            }).end()

        })

        router.post('/activeNFT', async (req: any, res: any) => {
            const ipaddress = getIpAddressFromForwardHeader(req)
			
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /registerReferrer req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			logger(Colors.magenta(`/activeNFT`), message, signMessage)
			
			const obj = checkSign (message, signMessage)

			const nftID = parseInt(obj?.data)
			if (!obj || !obj?.solanaWallet || !obj?.walletAddress || isNaN(nftID) || nftID < 100 ) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
            const isOwnship = await checkNFTOwnership (obj.walletAddress, nftID, obj?.solanaWallet)

            if (!isOwnship) {
                return res.status(402).json({error: 'No ownship'}).end()
            }
            return res.status(200).json({success: true}).end()

        })

        router.post ('/purchasePassportBySP', async (req: any, res: any) => {
            let ipaddress = getIpAddressFromForwardHeader(req)
			let message, signMessage
			try {
				message = req.body.message
				signMessage = req.body.signMessage

			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /purchasePassportBySP req.body ERROR!`), inspect(req.body))
				return res.status(404).json({
					error: 'message & signMessage Object Error!'
				}).end()
			}

			
			const obj = checkSign (message, signMessage)

			if (!obj || !obj?.walletAddress || !obj?.solanaWallet || !obj?.hash || !obj?.data) {
                logger (Colors.grey(`Router /purchasePassportBySP checkSignObj obj Error! !obj ${!obj} `))
                logger(inspect(obj, false, 3, true))

                return res.status(403).json({
                    error: 'message & signMessage Object walletAddress or solanaWallet Error!'
                }).end()
            }
            
            const kkk = await checkPurchasePassport(obj)

            if (!kkk) {
                logger (Colors.grey(`Router /purchasePassportBySP checkPurchasePassport = ${kkk}`))
                return res.status(403).json({
                    error: 'message & signMessage Object walletAddress or solanaWallet Error!'
                }).end()
            }
            logger(`/purchasePassportBySP success!`, inspect(obj, false, 3, true))
            return res.status(200).json({
                status: true
            }).end()

        })

        
		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${inspect(req.body, false, 3, true)}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

const changeActiveNFT_pool: {
    wallet: string
    nftID: number
    solanaWallet: string
}[] = []

const changeActiveNFT_Process = async () => {
    const obj = changeActiveNFT_pool.shift()
    if (!obj) {
        return
    }
    const SC = sp_reword_sc_pool.shift()
    if (!SC) {
        changeActiveNFT_pool.unshift(obj)
        logger(`changeActiveNFT_Process has no SC in pool ${sp_reword_sc_pool.length} waiting next!`)
        return setTimeout(() => {
            changeActiveNFT_Process()
        }, 1000)
    }

    try {
        const tx = await SC._changeActiveNFT (obj.wallet, obj.nftID, obj.solanaWallet)
        await tx.wait ()
        logger(`changeActiveNFT_Process ${obj.wallet}:${obj.nftID} Success ${tx.hash}`)
    } catch (ex) {

    }
    sp_reword_sc_pool.push(SC)
    changeActiveNFT_Process()
}

const checkNFTOwnership = async (wallet: string, nftID: number, solanaWallet: string) => {
    try {
        const _owner: bigint = await SP_Passport_SC_readonly.balanceOf(wallet, nftID)
        if ( _owner == BigInt(0)) {
            return false
        }

        changeActiveNFT_pool.push({
            wallet, nftID, solanaWallet
        })

        changeActiveNFT_Process()
        return true

    } catch (ex) {
        return false
    }
    
}

const duplicateFactoryAddr = '0x87A70eD480a2b904c607Ee68e6C3f8c54D58FB08'

const ChannelPartners = '0x2E2fd2A910E4b27946A30C00FD7F2A32069e52CC'

const SPClubWallet = new ethers.Wallet(masterSetup.ReferralManager, CONET_MAINNET)      //      0x9D27BEdb1d093F38726F60551CfefaD83fA838a2
const SPDuplicateFactoryContract = new ethers.Contract(duplicateFactoryAddr, duplicateFactory_ABI, SPClubWallet)


const SPClubManager = [SPDuplicateFactoryContract]
const initReferralsV3 = '0x2e6dF4aE1Fb0ed28C8955c94245e8E791393Da13'

const SPClubManagerPool = [new ethers.Contract(initReferralsV3, initReferralsV3ABI, SPClubWallet)]

const addReferralsPool: {
    wallet: string
    referrer: string
}[] = []

const addReferralsProcess = async () => {
    const obj = addReferralsPool.shift()
    if (!obj) {
        return
    }
    const SC = SPClubManagerPool.shift()
    if (!SC) {
        addReferralsPool.unshift(obj)
        return setTimeout(() => {
            addReferralsProcess()
        }, 5000)
    }

    try {
        
        const tx = await SC.initAddReferrer(obj.referrer, obj.wallet)
        await tx.wait()
        logger(`addReferralsProcess ${obj.wallet} => ${obj.referrer} success ${tx.hash}`)
    } catch (ex:any) {
        logger(`addReferralsProcess ${obj.wallet} => ${obj.referrer} Error ${ex.message}`)
    }
    SPClubManagerPool.push(SC)
    return setTimeout(() => {
        addReferralsProcess()
    }, 1000)
}

let cryptopWaymentWallet = 0

const getNextWallet = () => {
    return cryptoPayWallet.deriveChild(cryptopWaymentWallet++)
}

const agentWalletWhiteList: string[] = ['0x5f1A13189b5FA49baE8630bdc40d365729bC6629']


const getBNBPriceNumber = (plan: planStruct): number => {
    switch(plan) {
        default: {
            return 0
        }
        case '299': {
            return parseFloat((2.99/oracle.bnb).toFixed(6))
        }
        case '3100': {
            return parseFloat((31/oracle.bnb).toFixed(6)) 
        }
        case '2400': {
            return parseFloat((24.99/oracle.bnb).toFixed(6))
        }

        case '2860': {
            return parseFloat((28.6/oracle.bnb).toFixed(6))
        }

    }
}
const getUSDTPriceNumber = (plan: planStruct): number => {
    switch(plan) {
        default: {
            return 0
        }
        case '299': {
            return 2.99
        }
        case '3100': {
            return 31
        }
        case '2400': {
            return 24.99
        }

        case '2860': {
            return 28.6
        }

    }
}

const getPriceFromCryptoName = async (cryptoName: string, plan: planStruct): Promise<number> => {
    await oracolPrice()
    switch (cryptoName) {
        case 'BNB': {
            return getBNBPriceNumber(plan)
        }

        case 'BSC USDT': {
            return getUSDTPriceNumber(plan)
        }

        default: {
            return 0
        }
    }
}

const getAssetERC20Address = (cryptoName: string) => {
    switch (cryptoName) {

        case 'BNB USDT': {
            return '0x55d398326f99059fF775485246999027B3197955'
        }

        default: {
            return ``
        }
    }
}

const bnbPrivate = new ethers.JsonRpcProvider('https://bsc-dataseed.bnbchain.org/')
const waitingList: Map<string, number> = new Map()
const cryptoPaymentPath = '/home/peter/.data/cryptoPayment/'
const redeemPaymentPath = '/home/peter/.data/redeem/'
const plan2860Path = '/home/peter/.data/2860/'
const initWalletBalance: Map<string, number> = new Map()
const bnb_usdt_contract = new ethers.Contract('0x55d398326f99059fF775485246999027B3197955', ERC20_ABI, bnbPrivate)

const storePayment = async (wallet: ethers.HDNodeWallet, price: number, cryptoName: string, realNumber: number, err: boolean) => {
    const date = new Date()
    const obj = {address: wallet.address, privateKey: wallet.signingKey.privateKey, price, cryptoName, realNumber}
    const data = JSON.stringify(obj)
    const fileName = `${cryptoPaymentPath}${wallet.address}-${date.toJSON()}-${cryptoName}-${price.toFixed(8)}${err ? '.err.json' : '.json'}`
    await writeFileSync (fileName, data, 'utf8')
}





const SPGlodManager = new ethers.Wallet(masterSetup.SPClubGlod_Manager, CONET_MAINNET)              //          0xD603f2c8c774E7c9540c9564aaa7D94C34835858
const ChannelPartnersSC = new ethers.Contract(ChannelPartners, ChannelPartnersABI, SPGlodManager)



const ChannelPartnersSCPool = [ChannelPartnersSC]
type planStruct =  '1'| '0'| '299'| '2400' | '3100' |'2860'


const SPGlodProceePool: {
    walletAddress: string
    plan: planStruct
    pdaAddress: string
    solana: string
    amountSP: number
    HDWallet: string
    redeemCode: string
    paymentID: string
    appleID: string
}[] = []

const SPGlodProcess = async () => {
    const obj = SPGlodProceePool.shift()
    if (!obj) {
        return
    }
    const SC = ChannelPartnersSCPool.shift() 
    if (!SC) {
        SPGlodProceePool.unshift(obj)
        return
    }
    logger(inspect(obj, false, 3, true))
    let tx
    let NFT = 0
    let assetAccount = ''
    try {
        const duplicateAccount = await SPDuplicateFactoryContract.duplicateList(obj.walletAddress)
        assetAccount = duplicateAccount === ethers.ZeroAddress ? obj.walletAddress : duplicateAccount
        NFT = parseInt((await SP_Passport_SC_readonly.currentID()).toString()) + 1
        const amountSP = ethers.parseEther(obj.amountSP.toString())
        if (obj.redeemCode) {
            tx = await SC.redeemPassport(obj.redeemCode, assetAccount, obj.solana, obj.pdaAddress, amountSP)
        } else {
            switch(obj.plan) {
                case '299': {
                    tx = await SC.initSPMember(assetAccount, obj.solana, obj.pdaAddress, obj.paymentID, 31, amountSP)
                    break
                }
                case '2400': {
                    tx = await SC.initSPMember(assetAccount, obj.solana, obj.pdaAddress, obj.paymentID, 366, amountSP)
                    break
                }
                case '3100': {
                    tx = await SC.initSPGoldMember(assetAccount, obj.solana, obj.pdaAddress, obj.paymentID, amountSP)
                }
            }
            
        }
        await tx.wait()
        
    } catch (ex: any) {
        payment_waiting_status.set(obj.HDWallet||obj.walletAddress, 0)
        logger(`SPGlodProcess Error`, ex.message)

    }

    ChannelPartnersSCPool.unshift(SC)
    logger(`SPGlodProcess success tx = ${tx?.hash}`, inspect(obj, false, 3, true))

    if (tx?.hash && NFT > 100) {
        payment_waiting_status.set(obj.HDWallet || obj.walletAddress, NFT.toString())
        await checkNFTOwnership(assetAccount, NFT, obj.solana)
        if (obj.redeemCode) {
            await storeRedeem(obj.redeemCode, assetAccount, tx.hash, )
        }
    }
    if (obj.appleID) {
        const hash = ethers.solidityPackedKeccak256(['string'], [obj.appleID])
        applepayInfo.push({
            appTransactionId: hash,
            walletAddress: assetAccount,
            solanaWallet: obj.solana
        })
        
        addedApplepayInfo()
    }
    

    return SPGlodProcess()
}

const waitingTron_trx = (walletHD: ethers.HDNodeWallet, price: number, plan: planStruct, agentWallet: string, walletAddress: string, solana: string) => new Promise(async executor => {
    const wallet = walletHD.address.toLowerCase()
    const tronWalletAddr = ethToTronAddress(wallet)
    const initBalance = parseFloat(await balanceTron(tronWalletAddr))
    const checkBalance = async () => {
        const newBalance = parseFloat(await balanceTron(tronWalletAddr))
        const balance = newBalance - initBalance
        if (balance < 0.000001) {
            let count = waitingList.get(wallet) || 0
            if (++ count > 40) {
                return logger(`TRON-TRX ${tronWalletAddr} time over STOP listening!`)
            }
            waitingList.set(wallet, count)
            return setTimeout(async () => {
                logger(`waiting TRON-TRX count [${count}] ${tronWalletAddr}:${walletAddress} is ZERO ${balance}  do next waiting!`)
                return executor( await waitingTron_trx (walletHD, price, plan, agentWallet, walletAddress, solana))
            })
        }

        if (Math.abs(balance - price) > price * 0.05) {
            logger(`TRON-TRX price needed ${price} real got ${balance} Math.abs(balance-price) ${Math.abs( balance - price )} > price * 0.05 ${ price * 0.05 } Error!`)
            payment_waiting_status.set (wallet, 0)
            return storePayment(walletHD, price, 'TRON-TRX', balance, true)
        }

        logger(`waiting BNB_USDT price needed ${price} real got ${balance} Math.abs(balance-price) ${Math.abs( balance - price )} > price * 0.05 ${ price * 0.05 } SUCCESS!`)

        // if (plan !== '3') {
        //     const redeemCode = createRedeem (plan, agentWallet)
        //     payment_waiting_status.set (wallet, redeemCode)
        // } else {
        //     mintPluePlan(wallet, walletAddress, solana, agentWallet)
        // }
        
        // storePayment(walletHD, price, 'BNB-USDT', balance, false)
    }

    checkBalance()
    
})

const vestingPdaExec =  join(__dirname,`vestingPda`)


const checkPaymentID = async (paymentID: string): Promise<boolean> => {
    try {
        const status: boolean = await payment_SC_readOnly.getPayID(paymentID)
        return status
    } catch (ex: any) {
        return true
    }
    
}


const storePlan2860 = async (wallet: string, HDWallet: string, obj: {So_amount: string, SP_amount: string, from: string}) => {
    const date = new Date().toJSON()
    const path2860 = `${plan2860Path}client[${wallet}]-${date}-[${HDWallet ? HDWallet: ''}]-SP[${obj.SP_amount}].json`
    await writeFileSync (path2860, JSON.stringify(obj), 'utf8')
}

const Plan2860 = async (wallet: string, SolanaAddr: string, HDWallet: string) => {
        await getOracle()
        logger(inspect(oracleData, false, 3, true))
        const obj = {
            So_amount: '0',
            SP_amount: '0',
            from : SolanaAddr,
            wallet
        }
        if (oracleData?.data) {
            const price = oracleData.data
            const usd1So = 1/parseFloat(price.so)
            obj.SP_amount = (parseFloat(price.sp2499) * 10 ** 6).toFixed(0)

            obj.So_amount = (parseFloat(usd1So.toFixed(6)) * 10 ** 9).toFixed(0)
            returnPool.push(obj)

            returnSP_Pool_process()
            
        }
        payment_waiting_status.get(wallet)
        logger(`Plan2860`, inspect(obj, false, 3, true))
        await storePlan2860(wallet, HDWallet, obj)

}

const execVesting = async (plan: planStruct, walletAddress: string, solana: string, HDWallet: string,  paymentID: string, redeemCode = '', appleID = '') => {
    const startDays = plan === '299' ? 30 : 365
    const endDays = plan === '299' ? 1 : 5 * 365

    let amountUSDC = plan === '3100' ? 24.99 : 0

    let amountSP = 0
    let pdaAddress = ''

    if (paymentID) {
        const status = await checkPaymentID(paymentID)
        if (status) {
            return logger(`execVesting used paymentID ${paymentID} Error! plan[${plan}], walletAddress[${walletAddress}],solana[${solana}] appleID[${appleID}] `)
        }
    }   
    // if (amountUSDC > 0 ) {
    //     const cmd = `node ${vestingPdaExec} P=${solana} E=${endDays} L=${startDays} U=${amountUSDC}`
    //     logger(cmd)
    //     return exec(cmd, (error, stdout, stderr) => {
    //         const kkk = stdout.split('SP_Amount=')[1]
    //         if (kkk) {
    //             amountSP = parseFloat(kkk.split('\n')[0])
    //         }
    //         const kkk1 = stdout.split('escrowTokenAccount=')[1]
    //         if (kkk1) {
    //             pdaAddress = kkk1.split('\n')[0]
    //         }
    //         logger(`stdout`, stdout)
    //         logger(`stderr`,stderr)

    //         logger(`vestingPdaExec plan = ${plan} USDC = ${amountUSDC} startdays = ${startDays} endDays = ${endDays} pdaAddress = ${pdaAddress} amountSP = ${amountSP}`)

    //         SPGlodProceePool.push({
    //             solana,
    //             walletAddress,
    //             plan,
    //             pdaAddress,
    //             amountSP,
    //             HDWallet,
    //             hash
    //         })

    //         SPGlodProcess()
    //     })
    // }

    if(plan === '2860') {
        return Plan2860(walletAddress, solana, HDWallet)
    }

    const data = {
        solana,
        walletAddress,
        plan,
        pdaAddress: solana,
        amountSP,
        redeemCode,
        HDWallet,
        paymentID,
        appleID
    }

    SPGlodProceePool.push(data)

    logger(`execVesting`, inspect(data, false, 3, true))

    SPGlodProcess()

}

const waitingBNB_USDT = (walletHD: ethers.HDNodeWallet, price: number, plan: planStruct, agentWallet: string, walletAddress: string, solana: string) => new Promise(async executor => {
    const wallet = walletHD.address.toLowerCase()
    const initBalance = initWalletBalance.get (wallet)||0
    const _balance = await bnb_usdt_contract.balanceOf(wallet)
    const balanceNew = parseFloat(ethers.formatEther(_balance))
    const balance = balanceNew - initBalance

    if (balance <0.000001) {
        let count = waitingList.get(wallet) || 0
        if (++ count > 40) {
            return logger(`BNB-USDT ${wallet} time over STOP listening!`)
        }
        waitingList.set(wallet, count)

        return setTimeout(async () => {
            logger(`waiting BNB_USDT count [${count}] ${wallet}:${walletAddress} is ZERO ${balance}  do next waiting!`)
            return executor( await waitingBNB_USDT (walletHD, price, plan, agentWallet, walletAddress, solana))
        }, 15 * 1000)
    }
   
    if (Math.abs(balance - price) > price * 0.05) {
        logger(`waiting BNB_USDT price needed ${price} real got ${balance} Math.abs(balance-price) ${Math.abs( balance - price )} > price * 0.05 ${ price * 0.05 } Error!`)
        payment_waiting_status.set (wallet, 0)
        return storePayment(walletHD, price, 'BNB-USDT', balance, true)
    }

    logger(`waiting BNB_USDT ${walletHD.address} success got payment ${price}`)
    
    execVesting(plan, walletAddress, solana, wallet, v4())
    
    storePayment(walletHD, price, 'BNB-USDT', balance, false)

})

const createRedeemWaitingPool: {
    expiresDayes: number
    _referee: string
    redeemCode: string
}[] = []


const createRedeemWithSPPool: {
    expiresDayes: number
    redeemCode: string
}[] = []

const uuid62 = require('uuid62')

interface ICodeToClient {
	hash: string
	to: string
	solana: string
    uuid: string
}


const createRedeemProcess = async () => {
    const obj = createRedeemWaitingPool.shift()
    if (!obj) {
        return
    }
    const SC = sp_reword_sc_pool.shift()
    if (!SC) {
        createRedeemWaitingPool.unshift(obj)
        return setTimeout(() => {
            createRedeemProcess ()
        }, 2000)
    }
    try {
        const tx = await SC.cryptoSubscriptMint(obj.expiresDayes, obj._referee, obj.redeemCode)
        logger(`createRedeemProcess ${obj.expiresDayes} SUCCESS ===> ${tx.hash}`)
        await tx.wait ()
    } catch (ex: any) {
        logger(`createRedeemProcess Error!`, ex.message)
    }

    sp_reword_sc_pool.push(SC)
    createRedeemProcess ()


}

const createRedeemWithSPProcess = async () => {
    const obj = createRedeemWithSPPool.shift()
    if (!obj) {
        return
    }
    const SC = SPGlodProcessSc.shift()
    if (!SC) {
        createRedeemWithSPPool.unshift(obj)
        return setTimeout(() => {
            createRedeemWithSPProcess()
        }, 5000)
    }
    try {
        const tx = await SC.SPGoldRedeemMint(obj.expiresDayes, obj.redeemCode)
        await tx.wait()
        logger(`${obj.redeemCode} ==> ${obj.expiresDayes} tx = ${tx.hash}`)
    } catch (ex: any) {
        logger(`createRedeemWithSPProcess Error`, ex.message)
    }
    SPGlodProcessSc.unshift(SC)
    createRedeemWithSPProcess()
}

const getExpiresDayes = (plan: planStruct) => {
    switch(plan) {
        case '1' : {
            return 7
        }
        case '0' : {
            return 30
        }
        case '299': {
            return 31
        }
        case '2400': {
            return 366
        }
        case '3100': {
            return 36500
        }
        default: {
            return 0
        }
    }
}

const createRedeemWithSP = async(plan: planStruct) => {
    const expiresDayes = getExpiresDayes(plan)
    if (!expiresDayes ) {
        return logger(`createRedeemWithSP got expiresDayes === 0 Error! ${plan}`)
    }

    const RedeemCode = uuid62.v4()
    const hash = ethers.solidityPackedKeccak256(['string'], [RedeemCode])
    const data = {
         expiresDayes,
        redeemCode: hash
    }

    createRedeemWithSPPool.push(data)

    createRedeemWithSPProcess()
    // logger(`RedeemCode = ${RedeemCode}`,inspect(data, false, 3, true))
    return RedeemCode
}


const waitingBNB = (walletHD: ethers.HDNodeWallet, price: number, plan: planStruct, agentWallet: string, walletAddress: string, solana: string ) => new Promise(async executor => {
    const wallet = walletHD.address.toLowerCase()
    const initBalance = initWalletBalance.get (wallet)||0
    const _balance = await bnbPrivate.getBalance(wallet)
    const balanceNew = parseFloat(ethers.formatEther(_balance))
    const balance = balanceNew - initBalance

    if (balance <0.000001) {
        let count = waitingList.get(wallet) || 0
        if (++ count > 40) {
            return logger(`waitingBNB ${wallet} time over STOP listening!`)
        }
        waitingList.set(wallet, count)
        return setTimeout(async () => {
            // logger(`waitingBNB count [${count}] ${wallet} is ZERO ${balance} do next waiting!`)
            return executor( await waitingBNB (walletHD, price, plan, agentWallet, walletAddress, solana))
        }, 15 * 1000)
    }
   
    if (Math.abs(balance - price) > price * 0.05) {
        logger(`waitingBNB price needed ${price} real got ${balance} Math.abs(balance-price) ${Math.abs( balance - price )} > price * 0.05 ${ price * 0.05 } Error!`)
        payment_waiting_status.set (wallet, 0)
        return storePayment(walletHD, price, 'BNB', balance, true)
    }


    
    // if (plan === '1' || plan === '12') {
    //     const _plan: '1'|'12' = plan
    //     const redeemCode = createRedeem (_plan, agentWallet)
    //     payment_waiting_status.set (wallet, redeemCode)
    // } else {
    //     mintPluePlan(wallet, walletAddress, solana, agentWallet)
    // }
    
    logger(`waiting BNB ${walletHD.address} success got payment ${price}`)
    
    execVesting(plan, walletAddress, solana, wallet, v4() )

    storePayment(walletHD, price, 'BNB', balance, false)
})

const listenTransfer = async (price: number, cryptoName: string, plan: planStruct, walletAddress: string, solana: string): Promise<string> => {
    
    const agentWallet = await getReferrer(walletAddress)
    switch(cryptoName) {
        case 'BNB': {
            const wallet = getNextWallet()
            const _balance = await bnbPrivate.getBalance(wallet.address)
            const balance = parseFloat(ethers.formatEther(_balance))
            initWalletBalance.set(wallet.address.toLowerCase(), balance)
            payment_waiting_status.set(wallet.address.toLowerCase(), 1)
            waitingBNB (wallet, price, plan, agentWallet, walletAddress, solana)
            return wallet.address
        }
        case 'BSC USDT': {
            const wallet = getNextWallet()
            const _balance = await bnb_usdt_contract.balanceOf(wallet.address)
            const balance = parseFloat(ethers.formatEther(_balance))
            initWalletBalance.set(wallet.address.toLowerCase(), balance)
            payment_waiting_status.set(wallet.address.toLowerCase(), 1)
            waitingBNB_USDT(wallet, price, plan, agentWallet, walletAddress, solana)
            return wallet.address
        }

        // case 'TRON TRX': {
        //     waitingTron_trx(wallet, parseFloat(price), plan, agentWallet, walletAddress, solana)
        //     return true
        // }

        default: {
            return ''
        }
    }
    
}

const wallet_sp_reword = new ethers.Wallet( masterSetup.sp_reword, CONET_MAINNET)       //      0x784985d7dC024fE8a08519Bba16EA72f8170b5c2

const SPClubPointManagerV2 = '0x0e78F4f06B1F34cf5348361AA35e4Ec6460658bb'
const sp_reword_contract = new ethers.Contract(SPClubPointManagerV2, SPClubPointManagerABI, wallet_sp_reword)

const sp_reword_sc_pool: ethers.Contract[] = [sp_reword_contract]

const reword_pool: {wallet: string, solana: string, balance: BigInt}[] = []

const sp_reword_process = async () => {
    const obj = reword_pool.shift()
    if (!obj) {
        return
    }
    const SC = sp_reword_sc_pool.shift()
    if (!SC) {
        reword_pool.push(obj)
        return setTimeout(() => {
            sp_reword_process()
        }, 2000)
    }
    

    try {

        const duplicateAccount = await SPDuplicateFactoryContract.duplicateList(obj.wallet)
        const assetAccount = duplicateAccount === ethers.ZeroAddress ? obj.wallet : duplicateAccount
        const [tx, currentNFT] = await Promise.all([
            SC.mintReword(assetAccount, obj.solana, obj.balance),
            payment_SC_readOnly.getCurrntPasspurtNumber()
            
        ])
        
        await tx.wait()
        logger(`sp_reword_process ${assetAccount}:${obj.solana} success, tx= ${tx.hash}`)
        payment_waiting_status.set(obj.wallet, parseInt(currentNFT.toString()) + 1)

    } catch (ex: any) {
        logger(Colors.red(`sp_reword_process Error! ${obj.wallet} `), ex.message)
        payment_waiting_status.set(obj.wallet, 0)
    }

    sp_reword_sc_pool.push(SC)
    return sp_reword_process()
}

const revokeReward: string[] = []

const revokeRewardProcess = async () => {
    const wallet = revokeReward.shift()
    if (!wallet) {
        return
    }
    const SC = sp_reword_sc_pool.shift()
    if (!SC) {
        revokeReward.unshift(wallet)
        return setTimeout(() => {
            revokeRewardProcess()
        }, 2000)
    }
    try {
        const tx = await SC.revokeReword(wallet)
        await tx.wait()
        logger(`revokeRewardProcess ${wallet} success, tx= ${tx.hash}`)

    } catch (ex: any) {
        logger(Colors.red(`revokeRewardProcess Error! ${wallet} `), ex.message)
        revokeReward.unshift(wallet)
    }

    sp_reword_sc_pool.push(SC)
    return setTimeout(() => {
        revokeRewardProcess()
    }, 2000)
}

const monitorReward = async (wallet: string, solana: string, _balance: number, keepCount: number) => {
    logger(`monitorReward ${wallet} ${solana} keepCount = ${keepCount}`)
    if (keepCount > 44) {
        return
    }

    keepCount ++
    const repet = () => {
        
        return setTimeout(() => {
            monitorReward(wallet, solana, _balance, keepCount)
        }, 1000 * 60 * monitorRewardWaitingMins * Math.random());
    }
    
    const [balance] = await Promise.all([
        getBalance_SP(solana),
        getOracle()
    ])

    if (!oracleData.data|| typeof balance !== 'number' ) {
        return repet()
    }

    const price = parseInt(oracleData.data.sp2499)
    if (parseInt(balance.toFixed(0)) >= _balance || balance > price) {
        return repet()
    }
    logger(`monitorReward revock => ${wallet} ${solana} keepCount = ${keepCount}`)
    revokeReward.push(wallet)
    revokeRewardProcess()
}

const checkIsHoldSP = async (solana: string) => {
    try {
        const [balance] = await Promise.all([
            getBalance_SP(solana),
            getOracle()
        ])

        if (!oracleData.data) {
            return false
        }
        
        const price = parseInt(oracleData.data?.sp2499)
        
        if (typeof balance !== 'number'  || balance < price) {
            return false
        }

        return true
    } catch (ex) {
        return false
    }
}

const spRewardCheck = async (wallet: string, solana: string): Promise<false|number> => {

    try {
        const duplicateAccount = await SPDuplicateFactoryContract.duplicateList(wallet)
        const toAccount = duplicateAccount === ethers.ZeroAddress ? wallet : duplicateAccount
        
        const [status, balance] = await Promise.all([
            sp_reword_contract.isReadyReword(toAccount, solana),
            getBalance_SP(solana),
            getOracle()
        ])

        if (!oracleData.data) {
            return false
        }
        
        const initBalance = parseInt(ethers.formatUnits(status[1], spDecimalPlaces))
        const price = parseInt(oracleData.data?.sp2499)
        
        if (!status[0] ||typeof balance !== 'number'  || balance < price && (initBalance === 0 || initBalance > 0 && initBalance > balance)) {
            return false
        }

        return balance
    } catch (ex) {
        return false
    }
}

const ExpiresDays = 1000 * 60 * 60 * 24 * 7

const SP_passport_addr = '0x054498c353452A6F29FcA5E7A0c4D13b2D77fF08'
const passport_distributor_addr = '0x40d64D88A86D6efb721042225B812379dc97bc89'
const SP_Passport_SC_readonly = new ethers.Contract(SP_passport_addr, SP_ABI, CONET_MAINNET)
const SPManagermentcodeToClient= new ethers.Contract(passport_distributor_addr, passport_distributor_ABI, web2_wallet)
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

const SP_Club_Point_Manager = new ethers.Wallet(masterSetup.SP_Club_Point_Manager, CONET_MAINNET)
const SPClub_Point_manager = [new ethers.Contract('0x563344B7Dd3336a3e493429Cb7c435Ba86c2CfE9', CoNET_DePIN_SpClub_ABI, SP_Club_Point_Manager)]

const SPClub_Point_Process: {
    wallet: string
    referee: string
    expiresDayes: number
}[] = []

const SubscriptionPoint = 3
const RefferentSubscriptionPoint = 4

const process_SPClub_Poing_Process = async () => {
    const obj = SPClub_Point_Process.shift()
    if (!obj) {
        return
    }
    const SC = SPClub_Point_manager.shift()
    if (!SC) {
        SPClub_Point_Process.unshift(obj)
        return
    }

    try {
        
        const tx1 = await SC.mint (obj.wallet, SubscriptionPoint, obj.expiresDayes)
        await tx1.wait()
        if (obj.referee && obj.referee !== ethers.ZeroAddress) {
            const tx2 = await SC.mint (obj.referee, RefferentSubscriptionPoint, obj.expiresDayes)
            await tx2.wait()
        }

    } catch (ex: any) {
        logger(`process_SPClub_Poing Error!`, ex.message)
    }
    SPClub_Point_manager.unshift(SC)
    return process_SPClub_Poing_Process ()

}

const checkHash = async (hash_temp: string): Promise<undefined|string> => {
    const _hash = ethers.solidityPacked(['string'], [hash_temp])
    const hash = _hash.length > 32 ? _hash.substring(0, 66) : ethers.zeroPadBytes(_hash, 32)
    
    logger(`checkHash = ${hash}`)
    try {
        const isUsed = await payment_SC_readOnly.payID(hash)
        if (isUsed) {
            return undefined
        }
        return hash
    } catch (ex: any) {
        
    }
    return undefined
    
}

const applepayInfo: {
    appTransactionId: string
    walletAddress: string
    solanaWallet: string
}[] = []

const addedApplepayInfo = async () => {
    const obj = applepayInfo.shift()
    if (!obj) {
        return
    }
    const SC = Payment_SCPool.shift()
	if (!SC) {
		applepayInfo.push(obj)
		return
	}

    try {
        const tx = await SC.applePayStatus(obj.appTransactionId, obj.walletAddress, obj.solanaWallet)
        await tx.wait()
    } catch (ex: any) {
        logger(`addedApplepayInfo Error!`,ex.message)
    }

    Payment_SCPool.unshift(SC)
    addedApplepayInfo()

}

const mintPassport = async () => {
	const obj = mintPassportPool.shift()
	if (!obj) {
		return
	}

	const SC = Payment_SCPool.shift()
	if (!SC) {
		mintPassportPool.push(obj)
		return
	}

	logger(`mintPassport ${obj.walletAddress} ${obj.hash}`)
	try {
		const isHash = await SC.getPayID(obj.hash)
        //  already mint passwork
		if (isHash) {
            logger(`mintPassport hash ${obj.hash} alaready `)
			Payment_SCPool.push(SC)
			return mintPassport()
		}

		const currentNFT: BigInt = await SC.getCurrntPasspurtNumber()
        payment_waiting_status.set(obj.hdWallet||obj.walletAddress, parseInt(currentNFT.toString()) + 1)
		const ts = await SC.mintPassport(obj.walletAddress, obj.expiresDays, obj.hash)
		logger(`mintPassport obj.hdWallet||obj.walletAddress ${obj.hdWallet||obj.walletAddress} obj.walletAddress = [${obj.walletAddress}] NFT = [${parseInt(currentNFT.toString()) + 1}]${ts.hash}`)
		await ts.wait()
		
        const appleID = applePayData.get (obj.hash)
        if (appleID) {
            const hash = ethers.solidityPackedKeccak256(['string'], [appleID])
            const ts = await SC.applePayStatus(hash, obj.walletAddress, obj.solanaWallet)
            logger(`mintPassport applePayStatus ${obj.walletAddress} ${ obj.solanaWallet} hash = ${ts.hash}`)
            await ts.wait()
        }
        checkNFTOwnership(obj.walletAddress, parseInt(currentNFT.toString()) + 1, obj.solanaWallet)
	} catch (ex: any) {
		payment_waiting_status.set(obj.hdWallet||obj.walletAddress, 0)
		logger(`mintPassport Error! ${ex.message}`)
	}
	Payment_SCPool.push(SC)
   
	return mintPassport()
}


const StripeMonthlyID = 'price_1RcsePFmCrk3Nr7LtmKsjGb6'                    //      $3.29 / month
const StripeAnnualID = 'price_1RcsePFmCrk3Nr7L5nMhJXaI'                     //      $27.49 / year
const StripeMonthlyID_test = 'price_1RcI24FmCrk3Nr7LUeU5yXec'
const StripeYearID_test = 'price_1RcHomFmCrk3Nr7LlLRvdOjB'
const StripeGenesis_Circle_test = 'price_1RcHxMFmCrk3Nr7LziGOoDDm'
const StripeGenesis_Circle = 'price_1RcsePFmCrk3Nr7LGR2GPS37'                 //        $34.10
const StripeDeposit = 'price_1RpaLHFmCrk3Nr7LCjufawYq'                     //      $28.6 24.99 SP + 1usd Sol

const getStripePlanID = (price: string, testMode: boolean): string => {
    switch(price) {
        default: 
        case '0': {
            return ''
        }
        case '299': {
            return testMode ? StripeMonthlyID_test : StripeMonthlyID
        }
        //      $27.49 / year
        case '2400': {
            return testMode ? StripeYearID_test : StripeAnnualID
        }

        case '2860': {
            return StripeDeposit 
        }

        case '3100': {
             return testMode ? StripeGenesis_Circle_test : StripeGenesis_Circle
        }

    }
}

const makePaymentLink = async (stripe: Stripe,  walletAddress: string, solanaWallet: string, _price: planStruct ): Promise<string> => {
    const price = getStripePlanID(_price, false)
    if (!price) {
        return ''
    }
	const option: Stripe.PaymentLinkCreateParams = /!(31|37)00/.test(_price) ? {
		line_items: [{
			price,
			quantity: 1
		}],

		subscription_data: {
			metadata:{walletAddress,solanaWallet}
		}
		
	} :
    {
        line_items: [{
			price,
			quantity: 1
		}],
		metadata: {walletAddress,solanaWallet}
    }

	const paymentIntent = await stripe.paymentLinks.create(option)
	return paymentIntent.url
}

const getPlan = (payAmount: number): planStruct => {
    switch(payAmount) {
        case 2749: {
            return '2400'
        }
        case 329: {
            return '299'
        }
        case 3410: {
            return '3100'
        }
        case 2860: {
            return '2860'
        }

        default: {
            return '0'
        }
    }
}

const searchInvoices = async (stripe: Stripe, invoicesID: string) => {
	try {
		
		const paymentIntent = await stripe.invoices.retrieve(invoicesID)
		if (paymentIntent.status !== 'paid') {
			return false
		}
		const payAmount = paymentIntent.amount_paid
		
		const metadata = paymentIntent.subscription_details?.metadata
       
        
		if ( !metadata?.solanaWallet|| !metadata?.walletAddress) {
			logger(inspect(paymentIntent.subscription_details))
			return logger(`stripe Invoices subscription_details Error!`)
		}

		console.log(`PaymentIntent for ${paymentIntent.id} ${payAmount} was successful! wallets = ${inspect(metadata, false, 3, true)}`)
        const walletAddress = metadata.walletAddress?.toLowerCase()
        const plan = getPlan(payAmount)
        if (plan === '0') {
            return logger(`searchInvoices invoicesID = ${invoicesID} Plan Error payAmount = ${payAmount}`)
        }
        await execVesting(plan, walletAddress, metadata.solanaWallet, '', invoicesID)




        // payment_waiting_status.set(walletAddress, 1)
		// mintPassportPool.push({
		// 	walletAddress,
		// 	solanaWallet: metadata.solanaWallet,
		// 	expiresDays: payAmount === 299 ? 31: 372,
		// 	total: 1,
		// 	hash: paymentIntent.id
		// })
		// mintPassport()
        // if (payAmount !== 299 && metadata.solanaWallet) {
        //     makeSolanaProm(metadata.solanaWallet)
        // }
        // SPClub_Point_Process.push({
        //     expiresDayes: payAmount === 299 ? 31: 372,
        //     wallet: walletAddress,
        //     referee: await getReferrer(walletAddress)
        // })
        // process_SPClub_Poing_Process()
		
	} catch (ex: any) {
		logger(ex.message)
		return false
	}
}

const searchSession = async (stripe: Stripe, sessionId: string) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const payAmount = session?.amount_total
    const metadata = session?.metadata
    const status = session?.payment_status
    if (status !== 'paid' || !payAmount || !metadata?.solanaWallet|| !metadata?.walletAddress ) {
        return logger(`searchSession id ${sessionId} hasn't status paid status = ${status} Error!`)
    }
    const plan = getPlan(payAmount)
    await execVesting(plan, metadata.walletAddress?.toLowerCase(), metadata.solanaWallet, '', sessionId)
    logger(`searchSession ${sessionId} plan ${plan} [${metadata.walletAddress}] Success `)
}

let appleRootCAs: any = null
const oneDay = 1000 * 60 * 60 * 24
const appleVerificationUsage = async (transactionPayload: string): Promise<false|{plan: '001'|'002'|'006', appID: string, transactionId: string}> => {
    const enableOnlineChecks = true
    const didRecover = false
    const now = new Date().getTime()
    const appAppleId = 6740261324 // appAppleId is required when the environment is Production
	if (!appleRootCAs) {
		appleRootCAs = appleRoot.map(n => readFileSync(n))
	}
    const verifier = new SignedDataVerifier( appleRootCAs, enableOnlineChecks, environment, bundleId, appAppleId)
    try {
		const verifiedTransaction = await verifier.verifyAndDecodeTransaction(transactionPayload)
        logger(inspect(verifiedTransaction, false, 3, true))
        const plan = verifiedTransaction.productId
        const transactionId = verifiedTransaction.transactionId
        const expiresDateNumber = verifiedTransaction.expiresDate
        if ((plan === '001'||plan==='002'||plan=== '006') && transactionId && expiresDateNumber && verifiedTransaction.appTransactionId) {
            if (plan=== '006') {
                return { plan, appID: verifiedTransaction.appTransactionId, transactionId }
            }

            if ((plan === '001' || plan==='002') && expiresDateNumber + oneDay > now) {
                return { plan, appID: verifiedTransaction.appTransactionId, transactionId }
            }
            
        }
		
    } catch (ex: any) {
        logger(`appleVerificationUsage Error! ${ex.message}`)
    }
    return false
    
}

const applePayData: Map<string, number> = new Map()

const SilentPassAPPID = 6740261324      // appAppleId is required when the environment is Production

type appleProductType = '001'|'002'|'006'

const appleNotification_DID_RENEW = async (productId: appleProductType, appleID: string, paymentID: string) => {
    logger(`appleNotification_DID_RENEW appleID = ${appleID} productId = ${productId}`)
    const project = productId === '001' ? '299' : productId === '002' ? '2400' : productId ==='006' ? '3100' : '0'
    if (project === '0') {
        return logger(`appleNotification_DID_RENEW appleID = ${appleID} paymentID = ${paymentID} productId = ${productId} !== '001'|'002'|'006' Error!`)
    }

    const hash = ethers.solidityPackedKeccak256(['string'], [appleID])
    try {
        const [publicKey, Solana] = await payment_SC_readOnly.getAppleIDInfo(hash)
        if (publicKey && publicKey !== ethers.ZeroAddress) {
            logger(`appleNotification_DID_RENEW await payment_SC_readOnly.getAppleIDInfo(hash) = ${hash} publicKey ${publicKey} Solana ${Solana}`)
            return execVesting(project, publicKey, Solana, '', paymentID, '',appleID)
        }

        logger(`appleNotification_DID_RENEW.  payment_SC_readOnly.getAppleIDInfo(hash) ${hash} Error  appleID =  ${appleID} paymentID = ${paymentID} got publicKey ${publicKey} & Solana ${Solana} NULL Error! `)
    } catch (ex: any) {
        logger(`appleNotification_DID_RENEW await payment_SC_readOnly.getAppleIDInfo(hash) appleID = ${appleID} Error`, ex.message)
    }
    
    
}

const appleNotification = async (NotificationSignedPayload: string ) => {
	const enableOnlineChecks = true
	if (!appleRootCAs) {
		appleRootCAs = appleRoot.map(n => readFileSync(n))
	}
	const verifier = new SignedDataVerifier( appleRootCAs, enableOnlineChecks, environment, bundleId, SilentPassAPPID)
	try {
		const verifiedTransaction = await verifier.verifyAndDecodeNotification(NotificationSignedPayload)

        //      notificationType: 
        //          DID_RENEW
        //          SUBSCRIBED

		logger(`appleNotification got new notificationType: ${verifiedTransaction.notificationType}`)

		const data = verifiedTransaction?.data
        const notificationType = verifiedTransaction?.notificationType

        if ( data?.appAppleId === SilentPassAPPID) {
            switch(notificationType) {
                case 'SUBSCRIBED':
                case 'DID_RENEW': {
                    if (!data?.signedRenewalInfo) {
                        return logger(`SUBSCRIBED or DID_RENEW data.signedRenewalInfo == undefine ERROR!`)
                    }

                    const verifiedTransactionRenew = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo)

                    logger(`SUBSCRIBED or DID_RENEW`,inspect(verifiedTransactionRenew, false, 3, true))

                    if (verifiedTransactionRenew?.originalTransactionId && verifiedTransactionRenew?.productId) {
                        const productId = verifiedTransactionRenew.productId
                        const appleID = verifiedTransactionRenew?.appTransactionId
                        const paymentID =  verifiedTransactionRenew?.originalTransactionId
                        if ((productId === '001' || productId === '002') && appleID && paymentID) {

                            if (notificationType === 'DID_RENEW') {
                                const renewID = verifiedTransactionRenew?.renewalDate?.toString() || v4()
                                return appleNotification_DID_RENEW (productId, appleID, renewID)
                            }

                            //      SUBSCRIBED

                            const obj = applePayWaitingList.get (paymentID)
                            
                            if (!obj) {
                                
                                const paymentID = verifiedTransactionRenew?.originalTransactionId
                                if (paymentID) {
                                    logger(`appleNotification new verifiedTransactionRenew ${notificationType} hasn't obj setup OBJ with appleID = ${appleID}`, inspect({productId, paymentID}, false, 3, true))
                                    return applePayWaitingList.set(paymentID, {productId, appleID})
                                }

                                return logger(`appleNotification Error! appleID ${appleID} hasn't verifiedTransactionRenew.originalTransactionId`, inspect(verifiedTransactionRenew, false, 3, true))
                            }
                            
                            if (obj.productId === productId && obj?.publicKey && obj?.Solana) {
                                return execVesting(productId === '001' ? '299' : '2400', obj.publicKey, obj.Solana, '', paymentID,'', appleID)
                            }

                            logger(inspect(obj))

                            return logger(`appleNotification added new applePayWaiting paymentID[${paymentID}] productId[${productId}] Error!`)

                        }

                        return logger(`appleNotification got unknow productId ${productId}`, inspect(verifiedTransactionRenew, false, 3, true))
                    }

                    return logger(`notificationType === 'SUBSCRIBED' || notificationType === 'DID_RENEW' && verifiedTransactionRenew?.originalTransactionId ${verifiedTransactionRenew?.originalTransactionId} && verifiedTransactionRenew?.productId ${verifiedTransactionRenew?.productId} == false Error!`)
                }

                case 'ONE_TIME_CHARGE': {
                    if (!data?.signedTransactionInfo) {
                        return  logger(`ONE_TIME_CHARGE data.signedTransactionInfo == undefine ERROR!`)
                    }

                    const verifiedTransactionRenew = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo)
                    if (verifiedTransactionRenew?.originalTransactionId && verifiedTransactionRenew?.productId) {
                        const productId = verifiedTransactionRenew.productId
                        const appleID = verifiedTransactionRenew?.appTransactionId
                        const paymentID =  verifiedTransactionRenew?.originalTransactionId
                        if (productId === '006' && appleID && paymentID) {
                            const obj = applePayWaitingList.get (paymentID)
                            
                            if (!obj) {
                                
                                const paymentID = verifiedTransactionRenew?.originalTransactionId
                                if (paymentID) {
                                    logger(`ONE_TIME_CHARGE new verifiedTransactionRenew ${notificationType} hasn't obj setup OBJ with appleID = ${appleID}`, inspect({productId, paymentID}, false, 3, true))
                                    return applePayWaitingList.set(paymentID, {productId, appleID})
                                }

                                return logger(`ONE_TIME_CHARGE Error! appleID ${appleID} hasn't verifiedTransactionRenew.originalTransactionId`, inspect(verifiedTransactionRenew, false, 3, true))
                            }
                            
                            if (obj.productId === productId && obj?.publicKey && obj?.Solana) {

                                return execVesting('3100', obj.publicKey, obj.Solana, '', paymentID,'', appleID)
                            }

                            logger(inspect(obj))

                            return logger(`appleNotification added new applePayWaiting paymentID[${paymentID}] productId[${productId}] Error!`)
                        }
                        return logger(`ONE_TIME_CHARGE productId ${productId} === '006' && appleID ${appleID} && paymentID ${paymentID} ERROR!`)
                    }
                    
                    return logger(`ONE_TIME_CHARGE verifiedTransactionRenew?.originalTransactionId = ${verifiedTransactionRenew?.originalTransactionId} && verifiedTransactionRenew?.productId ${ verifiedTransactionRenew?.productId} === false`)
                }

                default: {
                    return logger(`appleNotification got unknow notificationType ${notificationType}`)
                }
            }
			
		}

        return logger(`appleNotification got data?.appAppleId ${data?.appAppleId} !== SilentPassAPPID ${SilentPassAPPID}`, inspect(verifiedTransaction, false, 3, true))

    } catch (ex: any) {
        logger(`appleVerificationUsage Error! ${ex.message}`)
    }
    
}

const checkAppleID = async (appleid: string) => {
    try {
        const hash = ethers.id (appleid)
        let walletAddress: string
        let solanaWallet: string
        [walletAddress, solanaWallet] = await payment_SC_readOnly.getAppleIDInfo(hash)
        if (walletAddress && walletAddress !== ethers.ZeroAddress) {
            walletAddress = walletAddress.toLowerCase()
            return {walletAddress, solanaWallet}
        }
    } catch (ex) {}
    return null
}

const checkApplePayTransactionId = async (id: string) => {
    try {
        const isHash = await payment_SC_readOnly.getPayID(id)
        return !isHash
    } catch (ex) {}
    return null
}

const applePayWaitingList: Map<string, {productId: string, Solana?: string, publicKey?: string, appleID: string}> = new Map()

const checkAppleReceipt = async (publicKey: string, Solana: string, transactionId: string, productId: string) => {
    const waitingData = applePayWaitingList.get(transactionId)

    if (!waitingData) {
        applePayWaitingList.set(transactionId, {
            productId, Solana, publicKey, appleID: ''
        })
        logger(`checkAppleReceipt hasn't any waiting! transactionId = ${transactionId}, productId = ${productId}, Solana = ${Solana}, publicKey = ${publicKey}` )
        return true
    }
    
    const wallet = publicKey.toLowerCase()

    execVesting(productId === '001' ? '299' : productId === '002' ? '2400' : '3100', wallet, Solana, '', transactionId, '', waitingData.appleID)
    return true

}

const appleReceipt = async (receipt: string, _walletAddress: string, solanaWallet: string): Promise<boolean> => {
	const encodedKey = readFileSync(filePath, 'binary')
	const client = new AppStoreServerAPIClient(encodedKey, keyId, issuerId, bundleId, environment)
	const receiptUtil = new ReceiptUtility()
    let didProcess = false
	const transactionId = receiptUtil.extractTransactionIdFromAppReceipt(receipt)
	if (transactionId != null) {
		const transactionHistoryRequest: TransactionHistoryRequest = {
			sort: Order.ASCENDING,
			revoked: false,
			productTypes: [ProductType.AUTO_RENEWABLE]
		}
		let response: HistoryResponse | null = null
		do {
			const revisionToken = response && response?.revision !== null && response?.revision !== undefined ? response.revision : null
			response = await client.getTransactionHistory(transactionId, revisionToken, transactionHistoryRequest, GetTransactionHistoryVersion.V2)
			logger(inspect(response, false, 3, true))
			if (response.signedTransactions) {
               const process = response.signedTransactions.map(n => appleVerificationUsage(n))
			   const resoule = await Promise.all(process)
               resoule.forEach(async n => {
                    if (n && !didProcess) {
                        didProcess = true
                        const walletAddress = _walletAddress.toLowerCase()
                        payment_waiting_status.set(walletAddress, 1)

                        logger(`appleReceipt start PURCHASE success ${_walletAddress} `, inspect(n, false, 3, true))
                        const plan: planStruct = n.plan === '001' ? '299' : n.plan === '002'? '2400' : '3100'
                        execVesting(plan,_walletAddress.toLowerCase(), solanaWallet, '', v4(),'', n.appID)
                        // mintPassportPool.push({
                        //     walletAddress, solanaWallet, total: 1,
                        //     expiresDays: n.plan === '001' ? 31 : 372,
                        //     hash: n.hash
                        // })
                        // SPClub_Point_Process.push({
                        //     expiresDayes: n.plan === '001' ? 31 : 372,
                        //     wallet: walletAddress,
                        //     referee: await getReferrer(walletAddress)
                        // })
                        // process_SPClub_Poing_Process()
                        // mintPassport()
                        // if (n.plan === '002') {
                        //     makeSolanaProm(solanaWallet)
                        // }
                        return true
                    }
               })
			}
		} while (response.hasMore)
	}
    return false
}

const solana_account = masterSetup.solana_return_manager                    //              A8Vk2LsNqKktabs4xPY4YUmYxBoDqcTdxY5em4EQm8v1
const solana_account_privatekeyArray = Bs58.decode(solana_account)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)

const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'

const spDecimalPlaces = 6
const solanaDecimalPlaces = 9
let oracleData: OracleData = {
	timeStamp: 0,
	data:null
}
const SP_Oracle_Addr = '0x96B2d95084C0D4b0dD67461Da06E22451389dE23'
const SP_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const returnPool: {
    wallet: string
	from: string
	SP_amount: string
    So_amount: string
}[] = []

const SP_Oracle_SC_reaonly = new ethers.Contract(SP_Oracle_Addr, SP_Oracle_ABI, CONET_MAINNET)

const getOracle = async () => {
    const timeStamp = new Date().getTime()
    if (oracleData && timeStamp - oracleData.timeStamp > 1000 * 60 ) {
        try {

            const [_sp249, _sp999, _sp2499, _sp9999, _so] = await SP_Oracle_SC_reaonly.getQuote()
            const sp249 = ethers.formatEther(_sp249)
            const sp999 = ethers.formatEther(_sp999)
            const sp2499 = ethers.formatEther(_sp2499)
            const sp9999 = ethers.formatEther(_sp9999)
            const so = ethers.formatEther(_so)
            oracleData = {
                timeStamp,
                data: {
                    sp249, sp999, sp2499, sp9999, so
                }
            }
            
        } catch (ex: any) {
            return logger(`getOracle Error ${ex.message}`)
        }
    }
}



const spRate = async(): Promise<{sp: string, so: string}> => {
    await getOracle()
    if (!oracleData?.data) {
        logger(`spRate !oracleData?.data Error!`)
        return {sp:'0', so:'0'}
    }

    const sp249 = parseFloat(oracleData.data.sp249)
    const so_usd = 1 - parseFloat(oracleData.data.so) * (0.0009 + 0.00001)

    const so = ethers.parseUnits('0.0009', solanaDecimalPlaces).toString()
    const sp =  ethers.parseUnits(((sp249/2.49) * so_usd).toFixed(6), spDecimalPlaces).toString()
    
    logger(inspect({sp, so}, false, 3, true))
    return {sp, so}

}

const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 9000
})


const SP_Address = new PublicKey(SP_address)


const returnSP = async (to: string, SP_Amount: string, Sol_Amount: string, privateKey: string) => {
    const to_address = new PublicKey(to)
    const connect = masterSetup.solana_rpc

    const fromKeypair = Keypair.fromSecretKey(Bs58.decode(privateKey))
    // const connect = getRandomNode()
    const SOLANA_CONNECTION = new Connection(connect, {
        commitment: "confirmed",
        disableRetryOnRateLimit: false,
    })
   
    
    const SP_amount = parseInt(SP_Amount)
    const SOL_amount = parseInt(Sol_Amount)

    try {
        const sourceAccount = await getOrCreateAssociatedTokenAccount(
            SOLANA_CONNECTION, 
            fromKeypair,
            SP_Address,
            fromKeypair.publicKey
        )

        const recipientTokenAddress = await getAssociatedTokenAddress(
            SP_Address,
            to_address
        )
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 200000
        })
        const tx = new Transaction().add(modifyComputeUnits).add(addPriorityFee)
        
        const accountInfo = await SOLANA_CONNECTION.getAccountInfo(recipientTokenAddress)

        if (!accountInfo) {
            
            tx.add(
                createAssociatedTokenAccountInstruction(
                    fromKeypair.publicKey,         // payer
                    recipientTokenAddress,    // ATA address
                    to_address,          // wallet owner
                    SP_Address                      // token mint
                )
            )
        }

        const transferInstructionSP = SP_Amount ? createTransferInstruction(
            sourceAccount.address,
            recipientTokenAddress,
            fromKeypair.publicKey,
            SP_amount
        ): null

        const transferInstructionSol = Sol_Amount ? SystemProgram.transfer({
            fromPubkey: fromKeypair.publicKey,
            toPubkey: new PublicKey(to),
            lamports: SOL_amount,
        }) : null


        if (transferInstructionSP) {
            tx.add (transferInstructionSP)
        }

        if (transferInstructionSol) {
            tx.add (transferInstructionSol)
        }

        const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash('confirmed')
        tx.recentBlockhash = latestBlockHash.blockhash
        
        const transactionSignature = await SOLANA_CONNECTION.sendTransaction(tx, [fromKeypair])
        
        logger(Colors.magenta(`returnSP from ${fromKeypair.publicKey} SP = ${ethers.formatUnits(SP_amount, spDecimalPlaces)} Sol = ${SOL_amount ? ethers.formatUnits(SOL_amount, solanaDecimalPlaces): null} hash = ${transactionSignature} success!`))
        return transactionSignature
    } catch (ex: any) {
        logger(Colors.magenta(`returnSP from ${fromKeypair.publicKey} SP =  ${ethers.formatUnits(SP_amount, spDecimalPlaces)} Sol = ${ethers.formatUnits(SOL_amount, solanaDecimalPlaces)} Error! ${ex.message}`))
    }
    
    // const option:TransactionConfirmationStrategy = {
    //     blockhash: latestBlockHash.blockhash,
    //         lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    //         signature: transactionSignature,
            
    // }   
    // try {
    //     const yyy = await SOLANA_CONNECTION.confirmTransaction(option, 'confirmed')
    //     logger(Colors.magenta(`returnSP from ${solana_account_privatekey.publicKey} SP = ${ethers.formatUnits(SP_Amount, spDecimalPlaces)} Sol = ${ethers.parseUnits(Sol_Amount, solanaDecimalPlaces)} ${inspect(yyy, false, 3, true)} success!`))
    // } catch(ex: any) {
    //     logger(Colors.magenta(`returnSP from ${solana_account_privatekey.publicKey} SP = ${ethers.formatUnits(SP_Amount, spDecimalPlaces)} Sol = ${ethers.parseUnits(Sol_Amount, solanaDecimalPlaces)} transactionSignature = ${transactionSignature} Error!`), ex.message)
    // }
    


    // try {
    //     const auth = await sendAndConfirmTransaction(SOLANA_CONNECTION, tx, [solana_account_privatekey], option)
    //     logger(Colors.magenta(`returnSP from ${solana_account_privatekey.publicKey} SP = ${ethers.parseUnits(SP_Amount, spDecimalPlaces)} Sol = ${ethers.parseUnits(Sol_Amount, solanaDecimalPlaces)} ${inspect(auth, false, 3, true)} success!`))
    // } catch (ex: any) {
    //     logger(Colors.red(`returnSP sendAndConfirmTransaction Error! ${ex.message}`))
    // }

    return ''
}

const getRandomNode = () => {
    const _node1 = Guardian_Nodes[Math.floor(Math.random() * (Guardian_Nodes.length - 1))]
    // return `https://${_node1.domain}.conet.network/solana-rpc`
    return solanaRPC_host
}
const solanaRPC_host = 'api.mainnet-beta.solana.com'
const getBalance_SP = async (solanaWallet: string): Promise<number|null> => {
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
            solanaWallet,
            { programId: SP_PROGRAM_ID },
            { encoding: "jsonParsed" },
        ],
    }
    const _node1 = Guardian_Nodes[Math.floor(Math.random() * (Guardian_Nodes.length - 1))]

    const ret: any = await HTTPS_PostTohost_JSON(`${getRandomNode()}`, '/', payload)
    if (ret === null || typeof ret === 'boolean') {
        return null
    }
    
    // logger(inspect(ret, false, 4, true))
    const tokenAccounts = ret?.result?.value ?? [];
    let balance = 0
    // logger(inspect(tokenAccounts, false, 4, true))
    for (let account of tokenAccounts) {
      const info = account.account.data.parsed.info;
    //   logger(inspect(info.mint, false, 3, true))
      if (info.mint === SP_address) {
        balance = info.tokenAmount.uiAmount; // Return balance in tokens
        // logger(inspect(info.tokenAmount, false, 3, true))
        return balance
      }
    }
    return 0

}

const sleepWaiting = (second: number) => new Promise(resolve => {
    setTimeout(() => {
        resolve(true)
    }, second)
})


let returnSP_Pool_processing = false

const returnSP_Pool_process = async () => {
	if (returnSP_Pool_processing) {
        return
    }
    
	const returnData = returnPool.shift()
	if (!returnData) {
		return
	}

    logger(inspect({publicKey: solana_account_privatekey.publicKey, returnData}, false, 3, true))
    returnSP_Pool_processing = true

    const tx = await returnSP (returnData.from, returnData.SP_amount, returnData.So_amount, solana_account)
    
    payment_waiting_status.set(returnData.wallet, tx)
    
	returnSP_Pool_processing = false
    
	returnSP_Pool_process()
}

const CONET_Guardian_PlanV7 = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'.toLowerCase()
const GuardianNodesInfoV6_cancun = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'
const provider = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')
let Guardian_Nodes: nodeInfo[] = []

const getAllNodes = () => new Promise(async resolve=> {

	const GuardianNodes = new ethers.Contract(CONET_Guardian_PlanV7, GuardianNodesV2ABI, provider)
	let scanNodes = 0
	try {
		const maxNodes: BigInt = await GuardianNodes.currentNodeID()
		scanNodes = parseInt(maxNodes.toString())

	} catch (ex) {
		resolve (false)
		return logger (`getAllNodes currentNodeID Error`, ex)
	}
	if (!scanNodes) {
		resolve (false)
		return logger(`getAllNodes STOP scan because scanNodes == 0`)
	}

	Guardian_Nodes = []

	for (let i = 0; i < scanNodes; i ++) {
		Guardian_Nodes.push({
			region: '',
			ip_addr: '',
			armoredPublicKey: '',
			nftNumber: 100 + i,
			domain: ''
		})
	}
		
	const GuardianNodesInfo = new ethers.Contract(GuardianNodesInfoV6_cancun, NodesInfoABI, provider)
	let i = 0
	mapLimit(Guardian_Nodes, 10, async (n: nodeInfo, next) => {
		i = n.nftNumber
		const nodeInfo = await GuardianNodesInfo.getNodeInfoById(n.nftNumber)
		n.region = nodeInfo.regionName
		n.ip_addr = nodeInfo.ipaddress
		n.armoredPublicKey = Buffer.from(nodeInfo.pgp,'base64').toString()
		const pgpKey1 = await readKey({ armoredKey: n.armoredPublicKey})
		n.domain = pgpKey1.getKeyIDs()[1].toHex().toUpperCase()
	}, err => {
		const index = Guardian_Nodes.findIndex(n => n.nftNumber === i) - 1
		Guardian_Nodes = Guardian_Nodes.slice(0, index)
		logger(Colors.red(`mapLimit catch ex! Guardian_Nodes = ${Guardian_Nodes.length} `))
		Guardian_Nodes = Guardian_Nodes.filter(n => n.armoredPublicKey)
		resolve(true)
	})
})

const testApple = async () => {
    const clientReceipt = `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`
	const receiptRenew = `eyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlFTURDQ0E3YWdBd0lCQWdJUWZUbGZkMGZOdkZXdnpDMVlJQU5zWGpBS0JnZ3Foa2pPUFFRREF6QjFNVVF3UWdZRFZRUURERHRCY0hCc1pTQlhiM0pzWkhkcFpHVWdSR1YyWld4dmNHVnlJRkpsYkdGMGFXOXVjeUJEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURUxNQWtHQTFVRUN3d0NSell4RXpBUkJnTlZCQW9NQ2tGd2NHeGxJRWx1WXk0eEN6QUpCZ05WQkFZVEFsVlRNQjRYRFRJek1Ea3hNakU1TlRFMU0xb1hEVEkxTVRBeE1URTVOVEUxTWxvd2daSXhRREErQmdOVkJBTU1OMUJ5YjJRZ1JVTkRJRTFoWXlCQmNIQWdVM1J2Y21VZ1lXNWtJR2xVZFc1bGN5QlRkRzl5WlNCU1pXTmxhWEIwSUZOcFoyNXBibWN4TERBcUJnTlZCQXNNSTBGd2NHeGxJRmR2Y214a2QybGtaU0JFWlhabGJHOXdaWElnVW1Wc1lYUnBiMjV6TVJNd0VRWURWUVFLREFwQmNIQnNaU0JKYm1NdU1Rc3dDUVlEVlFRR0V3SlZVekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCRUZFWWUvSnFUcXlRdi9kdFhrYXVESENTY1YxMjlGWVJWLzB4aUIyNG5DUWt6UWYzYXNISk9OUjVyMFJBMGFMdko0MzJoeTFTWk1vdXZ5ZnBtMjZqWFNqZ2dJSU1JSUNCREFNQmdOVkhSTUJBZjhFQWpBQU1COEdBMVVkSXdRWU1CYUFGRDh2bENOUjAxREptaWc5N2JCODVjK2xrR0taTUhBR0NDc0dBUVVGQndFQkJHUXdZakF0QmdnckJnRUZCUWN3QW9ZaGFIUjBjRG92TDJObGNuUnpMbUZ3Y0d4bExtTnZiUzkzZDJSeVp6WXVaR1Z5TURFR0NDc0dBUVVGQnpBQmhpVm9kSFJ3T2k4dmIyTnpjQzVoY0hCc1pTNWpiMjB2YjJOemNEQXpMWGQzWkhKbk5qQXlNSUlCSGdZRFZSMGdCSUlCRlRDQ0FSRXdnZ0VOQmdvcWhraUc5Mk5rQlFZQk1JSCtNSUhEQmdnckJnRUZCUWNDQWpDQnRneUJzMUpsYkdsaGJtTmxJRzl1SUhSb2FYTWdZMlZ5ZEdsbWFXTmhkR1VnWW5rZ1lXNTVJSEJoY25SNUlHRnpjM1Z0WlhNZ1lXTmpaWEIwWVc1alpTQnZaaUIwYUdVZ2RHaGxiaUJoY0hCc2FXTmhZbXhsSUhOMFlXNWtZWEprSUhSbGNtMXpJR0Z1WkNCamIyNWthWFJwYjI1eklHOW1JSFZ6WlN3Z1kyVnlkR2xtYVdOaGRHVWdjRzlzYVdONUlHRnVaQ0JqWlhKMGFXWnBZMkYwYVc5dUlIQnlZV04wYVdObElITjBZWFJsYldWdWRITXVNRFlHQ0NzR0FRVUZCd0lCRmlwb2RIUndPaTh2ZDNkM0xtRndjR3hsTG1OdmJTOWpaWEowYVdacFkyRjBaV0YxZEdodmNtbDBlUzh3SFFZRFZSME9CQllFRkFNczhQanM2VmhXR1FsekUyWk9FK0dYNE9vL01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBUUJnb3Foa2lHOTJOa0Jnc0JCQUlGQURBS0JnZ3Foa2pPUFFRREF3Tm9BREJsQWpFQTh5Uk5kc2twNTA2REZkUExnaExMSndBdjVKOGhCR0xhSThERXhkY1BYK2FCS2pqTzhlVW85S3BmcGNOWVVZNVlBakFQWG1NWEVaTCtRMDJhZHJtbXNoTnh6M05uS20rb3VRd1U3dkJUbjBMdmxNN3ZwczJZc2xWVGFtUllMNGFTczVrPSIsIk1JSURGakNDQXB5Z0F3SUJBZ0lVSXNHaFJ3cDBjMm52VTRZU3ljYWZQVGp6Yk5jd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NakV3TXpFM01qQXpOekV3V2hjTk16WXdNekU1TURBd01EQXdXakIxTVVRd1FnWURWUVFERER0QmNIQnNaU0JYYjNKc1pIZHBaR1VnUkdWMlpXeHZjR1Z5SUZKbGJHRjBhVzl1Y3lCRFpYSjBhV1pwWTJGMGFXOXVJRUYxZEdodmNtbDBlVEVMTUFrR0ExVUVDd3dDUnpZeEV6QVJCZ05WQkFvTUNrRndjR3hsSUVsdVl5NHhDekFKQmdOVkJBWVRBbFZUTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVic1FLQzk0UHJsV21aWG5YZ3R4emRWSkw4VDBTR1luZ0RSR3BuZ24zTjZQVDhKTUViN0ZEaTRiQm1QaENuWjMvc3E2UEYvY0djS1hXc0w1dk90ZVJoeUo0NXgzQVNQN2NPQithYW85MGZjcHhTdi9FWkZibmlBYk5nWkdoSWhwSW80SDZNSUgzTUJJR0ExVWRFd0VCL3dRSU1BWUJBZjhDQVFBd0h3WURWUjBqQkJnd0ZvQVV1N0Rlb1ZnemlKcWtpcG5ldnIzcnI5ckxKS3N3UmdZSUt3WUJCUVVIQVFFRU9qQTRNRFlHQ0NzR0FRVUZCekFCaGlwb2RIUndPaTh2YjJOemNDNWhjSEJzWlM1amIyMHZiMk56Y0RBekxXRndjR3hsY205dmRHTmhaek13TndZRFZSMGZCREF3TGpBc29DcWdLSVltYUhSMGNEb3ZMMk55YkM1aGNIQnNaUzVqYjIwdllYQndiR1Z5YjI5MFkyRm5NeTVqY213d0hRWURWUjBPQkJZRUZEOHZsQ05SMDFESm1pZzk3YkI4NWMrbGtHS1pNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQUtCZ2dxaGtqT1BRUURBd05vQURCbEFqQkFYaFNxNUl5S29nTUNQdHc0OTBCYUI2NzdDYUVHSlh1ZlFCL0VxWkdkNkNTamlDdE9udU1UYlhWWG14eGN4ZmtDTVFEVFNQeGFyWlh2TnJreFUzVGtVTUkzM3l6dkZWVlJUNHd4V0pDOTk0T3NkY1o0K1JHTnNZRHlSNWdtZHIwbkRHZz0iLCJNSUlDUXpDQ0FjbWdBd0lCQWdJSUxjWDhpTkxGUzVVd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NVFF3TkRNd01UZ3hPVEEyV2hjTk16a3dORE13TVRneE9UQTJXakJuTVJzd0dRWURWUVFEREJKQmNIQnNaU0JTYjI5MElFTkJJQzBnUnpNeEpqQWtCZ05WQkFzTUhVRndjR3hsSUVObGNuUnBabWxqWVhScGIyNGdRWFYwYUc5eWFYUjVNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVFzd0NRWURWUVFHRXdKVlV6QjJNQkFHQnlxR1NNNDlBZ0VHQlN1QkJBQWlBMklBQkpqcEx6MUFjcVR0a3lKeWdSTWMzUkNWOGNXalRuSGNGQmJaRHVXbUJTcDNaSHRmVGpqVHV4eEV0WC8xSDdZeVlsM0o2WVJiVHpCUEVWb0EvVmhZREtYMUR5eE5CMGNUZGRxWGw1ZHZNVnp0SzUxN0lEdll1VlRaWHBta09sRUtNYU5DTUVBd0hRWURWUjBPQkJZRUZMdXczcUZZTTRpYXBJcVozcjY5NjYvYXl5U3JNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTURBMmdBTUdVQ01RQ0Q2Y0hFRmw0YVhUUVkyZTN2OUd3T0FFWkx1Tit5UmhIRkQvM21lb3locG12T3dnUFVuUFdUeG5TNGF0K3FJeFVDTUcxbWloREsxQTNVVDgyTlF6NjBpbU9sTTI3amJkb1h0MlFmeUZNbStZaGlkRGtMRjF2TFVhZ002QmdENTZLeUtBPT0iXX0.eyJvcmlnaW5hbFRyYW5zYWN0aW9uSWQiOiIyMDAwMDAwODk1NzAwMDcxIiwiYXV0b1JlbmV3UHJvZHVjdElkIjoiMDAxIiwicHJvZHVjdElkIjoiMDAxIiwiYXV0b1JlbmV3U3RhdHVzIjoxLCJyZW5ld2FsUHJpY2UiOjMyOTAsImN1cnJlbmN5IjoiVVNEIiwic2lnbmVkRGF0ZSI6MTc0NDM1NTg5MTIxNCwiZW52aXJvbm1lbnQiOiJTYW5kYm94IiwicmVjZW50U3Vic2NyaXB0aW9uU3RhcnREYXRlIjoxNzQ0MzU1ODc4MDAwLCJyZW5ld2FsRGF0ZSI6MTc0NDM1OTQ3ODAwMCwiYXBwVHJhbnNhY3Rpb25JZCI6IjcwNDQwNDYyNDI3OTg0MTczNyJ9.v4T8IaGtaKI2weaHOx7maGU_NmNIPNayYux9ARQpyEqMQsC0tP5S74ZasPZSCy4yATEm6vxEu8RCUQk9ngVrTw`
	const signedTransactionInfo= `'eyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlFTURDQ0E3YWdBd0lCQWdJUWZUbGZkMGZOdkZXdnpDMVlJQU5zWGpBS0JnZ3Foa2pPUFFRREF6QjFNVVF3UWdZRFZRUURERHRCY0hCc1pTQlhiM0pzWkhkcFpHVWdSR1YyWld4dmNHVnlJRkpsYkdGMGFXOXVjeUJEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURUxNQWtHQTFVRUN3d0NSell4RXpBUkJnTlZCQW9NQ2tGd2NHeGxJRWx1WXk0eEN6QUpCZ05WQkFZVEFsVlRNQjRYRFRJek1Ea3hNakU1TlRFMU0xb1hEVEkxTVRBeE1URTVOVEUxTWxvd2daSXhRREErQmdOVkJBTU1OMUJ5YjJRZ1JVTkRJRTFoWXlCQmNIQWdVM1J2Y21VZ1lXNWtJR2xVZFc1bGN5QlRkRzl5WlNCU1pXTmxhWEIwSUZOcFoyNXBibWN4TERBcUJnTlZCQXNNSTBGd2NHeGxJRmR2Y214a2QybGtaU0JFWlhabGJHOXdaWElnVW1Wc1lYUnBiMjV6TVJNd0VRWURWUVFLREFwQmNIQnNaU0JKYm1NdU1Rc3dDUVlEVlFRR0V3SlZVekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCRUZFWWUvSnFUcXlRdi9kdFhrYXVESENTY1YxMjlGWVJWLzB4aUIyNG5DUWt6UWYzYXNISk9OUjVyMFJBMGFMdko0MzJoeTFTWk1vdXZ5ZnBtMjZqWFNqZ2dJSU1JSUNCREFNQmdOVkhSTUJBZjhFQWpBQU1COEdBMVVkSXdRWU1CYUFGRDh2bENOUjAxREptaWc5N2JCODVjK2xrR0taTUhBR0NDc0dBUVVGQndFQkJHUXdZakF0QmdnckJnRUZCUWN3QW9ZaGFIUjBjRG92TDJObGNuUnpMbUZ3Y0d4bExtTnZiUzkzZDJSeVp6WXVaR1Z5TURFR0NDc0dBUVVGQnpBQmhpVm9kSFJ3T2k4dmIyTnpjQzVoY0hCc1pTNWpiMjB2YjJOemNEQXpMWGQzWkhKbk5qQXlNSUlCSGdZRFZSMGdCSUlCRlRDQ0FSRXdnZ0VOQmdvcWhraUc5Mk5rQlFZQk1JSCtNSUhEQmdnckJnRUZCUWNDQWpDQnRneUJzMUpsYkdsaGJtTmxJRzl1SUhSb2FYTWdZMlZ5ZEdsbWFXTmhkR1VnWW5rZ1lXNTVJSEJoY25SNUlHRnpjM1Z0WlhNZ1lXTmpaWEIwWVc1alpTQnZaaUIwYUdVZ2RHaGxiaUJoY0hCc2FXTmhZbXhsSUhOMFlXNWtZWEprSUhSbGNtMXpJR0Z1WkNCamIyNWthWFJwYjI1eklHOW1JSFZ6WlN3Z1kyVnlkR2xtYVdOaGRHVWdjRzlzYVdONUlHRnVaQ0JqWlhKMGFXWnBZMkYwYVc5dUlIQnlZV04wYVdObElITjBZWFJsYldWdWRITXVNRFlHQ0NzR0FRVUZCd0lCRmlwb2RIUndPaTh2ZDNkM0xtRndjR3hsTG1OdmJTOWpaWEowYVdacFkyRjBaV0YxZEdodmNtbDBlUzh3SFFZRFZSME9CQllFRkFNczhQanM2VmhXR1FsekUyWk9FK0dYNE9vL01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBUUJnb3Foa2lHOTJOa0Jnc0JCQUlGQURBS0JnZ3Foa2pPUFFRREF3Tm9BREJsQWpFQTh5Uk5kc2twNTA2REZkUExnaExMSndBdjVKOGhCR0xhSThERXhkY1BYK2FCS2pqTzhlVW85S3BmcGNOWVVZNVlBakFQWG1NWEVaTCtRMDJhZHJtbXNoTnh6M05uS20rb3VRd1U3dkJUbjBMdmxNN3ZwczJZc2xWVGFtUllMNGFTczVrPSIsIk1JSURGakNDQXB5Z0F3SUJBZ0lVSXNHaFJ3cDBjMm52VTRZU3ljYWZQVGp6Yk5jd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NakV3TXpFM01qQXpOekV3V2hjTk16WXdNekU1TURBd01EQXdXakIxTVVRd1FnWURWUVFERER0QmNIQnNaU0JYYjNKc1pIZHBaR1VnUkdWMlpXeHZjR1Z5SUZKbGJHRjBhVzl1Y3lCRFpYSjBhV1pwWTJGMGFXOXVJRUYxZEdodmNtbDBlVEVMTUFrR0ExVUVDd3dDUnpZeEV6QVJCZ05WQkFvTUNrRndjR3hsSUVsdVl5NHhDekFKQmdOVkJBWVRBbFZUTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVic1FLQzk0UHJsV21aWG5YZ3R4emRWSkw4VDBTR1luZ0RSR3BuZ24zTjZQVDhKTUViN0ZEaTRiQm1QaENuWjMvc3E2UEYvY0djS1hXc0w1dk90ZVJoeUo0NXgzQVNQN2NPQithYW85MGZjcHhTdi9FWkZibmlBYk5nWkdoSWhwSW80SDZNSUgzTUJJR0ExVWRFd0VCL3dRSU1BWUJBZjhDQVFBd0h3WURWUjBqQkJnd0ZvQVV1N0Rlb1ZnemlKcWtpcG5ldnIzcnI5ckxKS3N3UmdZSUt3WUJCUVVIQVFFRU9qQTRNRFlHQ0NzR0FRVUZCekFCaGlwb2RIUndPaTh2YjJOemNDNWhjSEJzWlM1amIyMHZiMk56Y0RBekxXRndjR3hsY205dmRHTmhaek13TndZRFZSMGZCREF3TGpBc29DcWdLSVltYUhSMGNEb3ZMMk55YkM1aGNIQnNaUzVqYjIwdllYQndiR1Z5YjI5MFkyRm5NeTVqY213d0hRWURWUjBPQkJZRUZEOHZsQ05SMDFESm1pZzk3YkI4NWMrbGtHS1pNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQUtCZ2dxaGtqT1BRUURBd05vQURCbEFqQkFYaFNxNUl5S29nTUNQdHc0OTBCYUI2NzdDYUVHSlh1ZlFCL0VxWkdkNkNTamlDdE9udU1UYlhWWG14eGN4ZmtDTVFEVFNQeGFyWlh2TnJreFUzVGtVTUkzM3l6dkZWVlJUNHd4V0pDOTk0T3NkY1o0K1JHTnNZRHlSNWdtZHIwbkRHZz0iLCJNSUlDUXpDQ0FjbWdBd0lCQWdJSUxjWDhpTkxGUzVVd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NVFF3TkRNd01UZ3hPVEEyV2hjTk16a3dORE13TVRneE9UQTJXakJuTVJzd0dRWURWUVFEREJKQmNIQnNaU0JTYjI5MElFTkJJQzBnUnpNeEpqQWtCZ05WQkFzTUhVRndjR3hsSUVObGNuUnBabWxqWVhScGIyNGdRWFYwYUc5eWFYUjVNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVFzd0NRWURWUVFHRXdKVlV6QjJNQkFHQnlxR1NNNDlBZ0VHQlN1QkJBQWlBMklBQkpqcEx6MUFjcVR0a3lKeWdSTWMzUkNWOGNXalRuSGNGQmJaRHVXbUJTcDNaSHRmVGpqVHV4eEV0WC8xSDdZeVlsM0o2WVJiVHpCUEVWb0EvVmhZREtYMUR5eE5CMGNUZGRxWGw1ZHZNVnp0SzUxN0lEdll1VlRaWHBta09sRUtNYU5DTUVBd0hRWURWUjBPQkJZRUZMdXczcUZZTTRpYXBJcVozcjY5NjYvYXl5U3JNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTURBMmdBTUdVQ01RQ0Q2Y0hFRmw0YVhUUVkyZTN2OUd3T0FFWkx1Tit5UmhIRkQvM21lb3locG12T3dnUFVuUFdUeG5TNGF0K3FJeFVDTUcxbWloREsxQTNVVDgyTlF6NjBpbU9sTTI3amJkb1h0MlFmeUZNbStZaGlkRGtMRjF2TFVhZ002QmdENTZLeUtBPT0iXX0.eyJ0cmFuc2FjdGlvbklkIjoiMjAwMDAwMDk0NTAxNTU2MiIsIm9yaWdpbmFsVHJhbnNhY3Rpb25JZCI6IjIwMDAwMDA5NDUwMTU1NjIiLCJidW5kbGVJZCI6ImNvbS5meDE2OC5Db05FVFZQTjEuQ29ORVRWUE4xIiwicHJvZHVjdElkIjoiMDA2IiwicHVyY2hhc2VEYXRlIjoxNzUwNDE5NzM2MDAwLCJvcmlnaW5hbFB1cmNoYXNlRGF0ZSI6MTc1MDQxOTczNjAwMCwicXVhbnRpdHkiOjEsInR5cGUiOiJOb24tUmVuZXdpbmcgU3Vic2NyaXB0aW9uIiwiaW5BcHBPd25lcnNoaXBUeXBlIjoiUFVSQ0hBU0VEIiwic2lnbmVkRGF0ZSI6MTc1MDQxOTc0Njg1MSwiZW52aXJvbm1lbnQiOiJTYW5kYm94IiwidHJhbnNhY3Rpb25SZWFzb24iOiJQVVJDSEFTRSIsInN0b3JlZnJvbnQiOiJDQU4iLCJzdG9yZWZyb250SWQiOiIxNDM0NTUiLCJwcmljZSI6NTk5OTAsImN1cnJlbmN5IjoiQ0FEIiwiYXBwVHJhbnNhY3Rpb25JZCI6IjcwNDU2MTM2ODQ2ODYzNjk5NyJ9.mgbLnoT6gPxdszcVJuYiKdkxo3CVb_8eniFkiniJBk0iRCl6aNH-KWpbpoBFK0g6EremugebdVtpKkzJXl7BYQ'`
    await appleNotification(signedTransactionInfo)
    // await appleReceipt(clientReceipt, '0x42edA5d2cC859EB66F21646232C8BF2BeC902354', '79LG8KejFr1Hpn3mHd5ZLj7TmkQ4ucTFURFBZMydQzvd')
    // const kkk = await checkAppleID('6740261324')
    // logger(kkk)
}


// new conet_dl_server()

// const test = async () => {
//     // const balance = await getBalance_SP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
//     // logger(inspect(balance, false, 3, true))

//     const kk = await spRewardCheck ('0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff', 'CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
//     logger(inspect(kk, false, 3, true))
// }


// const testPaymentLink = async() => {
// 	const walletAddress = ''
// 	const solanaWallet = ''
// 	const stripe = new Stripe(masterSetup.stripe_SecretKey)
// 	const kk = await makePaymentLink(stripe, walletAddress, solanaWallet, 299)
// }

// testPaymentLink()
// appleReceipt(kk, kk1, kk2)

// spRate()

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/payment_stripe

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/applePayUser
//  curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0", "id":1,"method": "getRecentPrioritizationFees","params": [["A8Vk2LsNqKktabs4xPY4YUmYxBoDqcTdxY5em4EQm8v1"]]}'


new conet_dl_server ()


const createRedeemWithSPProcessAdmin = async (): Promise<void> => {
    for (let i = 0; i < 1; i ++) {
        const redeemCode = await createRedeemWithSP ('0')
        console.log(redeemCode)
    }
    logger(`success!`)
}


const test1 = async () => {

    // returnSP('CpAhvs19ymPEM6otAbumfKgxSgDRMxCsqtckBYA4s789',(0.1 * 10 ** spDecimalPlaces).toString(), '', solana_account)
    // returnSP('81i2Ed2cK6xN8DFsJjwX2tkadGnYggjXss9bg19i97D5', (0.1 * 10 ** spDecimalPlaces).toString(), '', masterSetup.SP_Club_Airdrop_solana)
    // returnSP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8',(100 * 10 ** spDecimalPlaces).toString(), '')
    // setTimeout(async () => {
        // returnSP('A4y9UWXZ6FYNRuWzm47nWJWdmdcic7p35SdDFHJj3Ei8', (0.1 * 10 ** spDecimalPlaces).toString(), '', masterSetup.SP_Club_Airdrop_solana)
        // const kk = await spRewardCheck('0x8c82B65E05336924723bEf6E7536997B8bf27e82','7ivGrVLkvmkUFwK3qXfuKvkNfuhjjXozz48qsbeyUdHi')
        const kk = await spRewardCheck('0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff','CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
        logger(kk)
    //     //returnSP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8',(100 * 10 ** spDecimalPlaces).toString(), '')
    //     // airDropForSP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8', 1 * 10 ** spDecimalPlaces)
    // }, 10000)

    //
    // SPGlodProceePool.push({
    //     plan: '3100',
    //     solana: 'HmnvoHxKMnu6rY7Eo4jt7h2PjjEKRNpgaBCMMfaQKVU4',
    //     pdaAddress: 'BDPDbQs5MANK7LCCeCzaMxaJt4BcBBv5ZsEw8SJcQP4L',
    //     amountSP: 348150.851069,
    //     HDWallet: '',
    //     walletAddress: '0x8C0F2f3c0C46e377e7C6316E28499c4DD2d3Dc18'
    // })

    // SPGlodProcess()
    const testAddr = '0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff'
    const testSolana = 'BDPDbQs5MANK7LCCeCzaMxaJt4BcBBv5ZsEw8SJcQP4L'
    const stripe = new Stripe(masterSetup.stripe_SecretKey)
    const re = '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'
    // const kk = await makePaymentLink(stripe, testAddr, testSolana, '3100')
    appleReceipt(re, '0x3eE8b6034611A09d8370F515D9a68e90a3AebeB6', 'BNYDdehXqvmerxBsCAmTKd9DD2VbouCrZzQe8zH1vu4m')
    //logger(`makePaymentLink return kk = ${kk}`)
    // searchSession(stripe, 'cs_test_a1PjLBhilSBizVk0kNKipgfuJTqS6xiXzrQ3wHpL446IDNjCM7hXbMR41A')
}

const postData1 = async () => {
    const obj = {
        "walletAddress": "0xf54f8a7aac17d88fe0046b65044caeb7581be2f2",
        "solanaWallet": "5gSqUiC8UNMEiiuLVnUhmi1UD3y2U87de6Hk5KVR6R9W",
        "hash": "41P2e7LCqsTx7pizJEWQxMCpzM2zQKdS75pfurzMMidWrnwh9JopPALwJ6JHFTRk1YNNKJhynYtwkv54jhbzjq4s",
        "data": "vzfPvNgt4HebmLefkSNLZWZXFzRnFJkov3hmwCzYUPbgb84PGj3Q5SaM2doiYCtGus6uCHTe3Se3irbtwEYSApi",
        uuid: ''
    }
    const rrr = await checkPurchasePassport(obj)
    logger(`postData1 checkPurchasePassport success! ${rrr}`)
}

const postData = async () => {
    const kkk = {
        "message": "{\"walletAddress\":\"0x737fCfCEcE98cF6fD980209fbfA32d051DA6170A\",\"solanaWallet\":\"GmjaU5o7sFf7LrRnE6utF4gxE3RkjzHrtq5wXhA9wXj6\",\"hash\":\"5CguR88cUNaXH6k6nrTUKrryvSE3eLwVt3WS2tVHYNVu4ZfAg691WjUwthoWBaqvuQsqZsGyPEBquPHxsca8zgJ2\",\"data\":\"zEVDaLyjBZNx3eeR18N4pg7a3sMY1G3SawCB4575tRAV8GtosgqHi5rpYy7zqA73rBNjsjQsMG49sQmLUKS1PkX\"}",
        "signMessage": "0x9039f3090a41ae7bd2ecc017e4dc89fd3d86ec9029a30d27646c91af58aef7590ca45c2e3039849a9a6ae2c7610a7c33ca9698ae6d9aa36b83561ae478bd001c1b"
    }
    const obj = checkSign (kkk.message, kkk.signMessage)
    if (!obj) {
        return logger(`postData Error !`)
    }

    logger(inspect(obj, false, 3, true))
    const rrr = await checkPurchasePassport(obj)
    if (!rrr) {
        return logger(`checkPurchasePassport Error!`)
    }
    logger(`postData success PurchasePassport = ${rrr}`)
}

// checkSolanaPayment('2cCyqNKdMCHKm8htLopues7eDNze84MV4u6ta5Vh8ch82ajRoU5QHHQ2mQBqDLvMDu8jaqf165uTDMkm1dyZCkdM','0x32EEb20b97fa7F71aF881618E1a7A4460474B73e')

// const check = async () => {
//     const kkk = await spRewardCheck('0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff', 'CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
// }

// setTimeout (() => {
//     check()
// }, 10000)

// createRedeemWithSPProcessAdmin ()
// test()

///                 sudo journalctl  -n 1000 --no-pager -f -u conetPayment.service 
// getReferrer('0x878a0F282fd87790633dc73D2aB58479CEc48D4B')
// postData1()
// getBalance_SP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
// testApple()

//  sudo journalctl -u conetPayment.service -n 10000 --no-pager

/**
 *                  getPriceFromCryptoName
 *                  2782 returnSP_Pool_process
 */



const test2 = async () => {
    // await execVesting('0', '0x908304aa26023ebb28eb76022a42a8d4f4c18125', 'FpxFE6uegP6j5pmr7fhx543BYr5NTwa75CG2JCgGf3Hc','','', '5KbgRUNI5ypnWIGiydXq4d', '')
    // const kk = await spRewardCheck('0xF1a784ab7FdF578d79C74D6fE68017F2bEAb40Fe','CVUGfqihk2owM3GF5UmPNskAUFdpzrPDyoDrkWRdzXw')
    // logger(kk)
    const stripe = new Stripe(masterSetup.stripe_SecretKey)

    // const kk = await makePaymentLink(stripe, '0x908304aa26023ebb28eb76022a42a8d4f4c18125', 'FpxFE6uegP6j5pmr7fhx543BYr5NTwa75CG2JCgGf3Hc', '2860')       2782 returnSP_Pool_process
    // logger(kk)
    //Plan2860('0x645cB92752Ef1BDF173ec085C2d8640b9dA2dD8E','CVUGfqihk2owM3GF5UmPNskAUFdpzrPDyoDrkWRdzXw', '' )
    const kkk = await getPriceFromCryptoName('BSC USDT', '2860')
    console.log(kkk)
}

// test2()

