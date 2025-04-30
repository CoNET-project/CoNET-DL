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
import { getOrCreateAssociatedTokenAccount,createBurnCheckedInstruction, createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token"
import Bs58 from 'bs58'
import { Connection, PublicKey, Keypair,Transaction, sendAndConfirmTransaction, SystemProgram, SendOptions, ComputeBudgetProgram, TransactionConfirmationStrategy } from "@solana/web3.js"
import {getSimulationComputeUnits} from "@solana-developers/helpers"
import SP_Oracle_ABI from './SP_OracleABI.json'
import SP_Reward_ABI from './spReward_ABI.json'
import {request as HTTPS_Request, RequestOptions} from 'node:https'
import GuardianOracle_ABI from './GuardianOracleABI.json'
import {v4} from 'uuid'
import { writeFileSync} from 'node:fs'

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
const Cancun_provide = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')

const fx168PublicKey = `0xB83A30169F696fc3B997F87eAfe85894235f7d77`.toLowerCase()

const oracleSC_addr = '0x0Ac28e301FeE0f60439675594141BEB53853f7b9'
const oracleSC = new ethers.Contract(oracleSC_addr, GuardianOracle_ABI, Cancun_provide)
const cryptoPayWallet = ethers.Wallet.fromPhrase(masterSetup.cryptoPayWallet)
const environment = Environment.SANDBOX

type wallets = {
	walletAddress: string
	solanaWallet: string
}

type walletsProcess = {
	walletAddress: string
	solanaWallet: string
	monthly: boolean
	total: number
	hash: string
}

const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const web2_wallet = new ethers.Wallet(masterSetup.web2_PaymentPassport, CONET_MAINNET)
const PaymentPassport_addr = '0x3F7D3F23D0A00C60f5231De78094bD7409C72AF9'
const payment_SC = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, web2_wallet)
const payment_SC_readOnly = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, CONET_MAINNET)
const Payment_SCPool: ethers.Contract[] = []
Payment_SCPool.push(payment_SC)

const payment_waiting_status: Map<string, number|string> = new Map()
const mintPassportPool: walletsProcess[]  = []

const HTTPS_PostTohost_JSON = async (host: string, path: string, obj: any) => new Promise(async resolve => {
    
    const option: RequestOptions = {
        hostname: host,
        path,
        port: 443,
        method: 'POST',
        protocol: 'https:',
        headers: {
            'Content-Type': 'application/json'
        }
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
        return resolve (false) 
    })

    req.write(JSON.stringify(obj))
    req.end()
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

class conet_dl_server {

	private PORT = 8005
	private stripe = new Stripe(masterSetup.stripe_SecretKey)
	private initSetupData = async () => {
		this.startServer()
        getOracle()
        oracolDeman()
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
            const data = req.body
            if (!data.receipt || !data.walletAddress ||!data.solanaWallet) {
                return res.status(403).json({error: 'unsupport data format!'}).end()
            }
            
            await appleReceipt(data.receipt, data.walletAddress, data.solanaWallet)
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
				logger (Colors.grey(`${ipaddress} request /payment_stripe_waiting req.body ERROR!`), inspect(req.body))
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
				monthly: data?.type === '1'?  true: false,
				total: 1,
				hash: data.hash
			})
			mintPassport()
			res.status(200).json({success: true})

		})

		router.post('/stripeHook', Express.raw({type: 'application/json'}), async (req: any, res: any) => {
			let event = req.body
			switch (event.type) {
				case 'invoice.payment_succeeded': {
					const paymentIntent: Stripe.Invoice = event.data.object
					searchInvoices (this.stripe, paymentIntent.id)
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
			logger(Colors.magenta(`/PurchaseCONETianPlan`), message, signMessage)
			
			const obj = checkSign (message, signMessage)
			const price = obj?.price
			if (!obj || !obj?.walletAddress||!obj?.solanaWallet|| (price !== 299 && price !== 2499)) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			
			const url = await makePaymentLink(this.stripe, obj.walletAddress, obj.solanaWallet, price)
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
			if (!status) {
				logger(`/payment_stripe_waiting ${obj.walletAddress} got unknow status! ${status}`)
				return res.status(402).json({error: `No ${obj.walletAddress} status`}).end()
			}
			logger(`/payment_stripe_waiting ${obj.walletAddress} got ${status}`)
			return res.status(200).json({ status }).end()
		})

        router.post('/cryptoPayment_waiting', async (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			let _wallet
			try {
				_wallet = req.body.wallet
			} catch (ex) {
				logger (Colors.grey(`${ipaddress} request /payment_stripe_waiting req.body ERROR!`), inspect(req.body))
				return res.status(402).json({error: 'Data format error!'}).end()
			}
			const wallet = _wallet.toLowerCase()
			const status = payment_waiting_status.get(wallet)
			if (!status) {
				logger(`/cryptoPayment_waiting ${inspect(req.body, false, 3, true)} got unknow status! ${status}`)
				return res.status(402).json({error: `No status`}).end()
			}
			logger(`/cryptoPayment_waiting ${wallet} got ${status}`)
            waitingList.set(wallet, 0)
			return res.status(200).json({ status }).end()
		})



        router.post('/applePay', async (req: any, res: any) => {
            const body = req.body
            logger(`applePay!`)
			if (body.signedPayload) {
				appleNotification(body.signedPayload)
			}
            res.status(200).json({received: true}).end()
        })

		router.post('/cryptoPay', async (req: any, res: any) => {

            const body = req.body
            const ipaddress = getIpAddressFromForwardHeader(req)
            logger(`cryptoPay! ipaddress = ${ipaddress}`)
			const agentWallet = body?.agentWallet
            const cryptoName = body?.cryptoName
            const error = JSON.stringify({error: 'Format error!'})
            if (!agentWallet || !cryptoName) {
                return res.end(error)
            }

            const _wallet = await getCryptoPay(agentWallet, cryptoName)
            const transferNumber = getPriceFromCryptoName(cryptoName)
            if (!_wallet|| !transferNumber) {
                return res.end(error)
            }
            
            listenTransfer(_wallet, transferNumber, cryptoName )
            const wallet = _wallet.address.toLowerCase()
            res.json({success: true, wallet, transferNumber}).end()
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
			if (!obj || !obj?.walletAddress||!obj?.solanaWallet) {
				return res.status(402).json({error: 'No necessary parameters'}).end()
			}
			
			const status = await spRewardCheck(obj.walletAddress, obj.solanaWallet)

            if (!status) {

                return res.status(403).json({error: 'Not available'}).end()
            }

            payment_waiting_status.set(obj.walletAddress, 1)

            reword_pool.push({
                wallet: obj.walletAddress,
                solana: obj.solanaWallet
            })
            sp_reword_process()

			return res.status(200).json({success: true}).end()
		})

		
		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${inspect(req.body, false, 3, true)}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
	}
}

let cryptopWaymentWallet = 0
const getNextWallet = () => {
    return cryptoPayWallet.deriveChild(cryptopWaymentWallet++)
}

const agentWalletWhiteList: string[] = ['0x5f1A13189b5FA49baE8630bdc40d365729bC6629']

const getPriceFromCryptoName = (cryptoName: string) => {
    switch (cryptoName) {
        case 'BNB': {
            return (24.99/oracle.bnb).toFixed(6)
        }
        case 'BNB USDT': {
            return '24.99'
        }
        default: {
            return ''
        }
    }
}

const bnbPrivate = new ethers.JsonRpcProvider('https://bsc-dataseed.bnbchain.org/')
const waitingList: Map<string, number> = new Map()
const cryptoPaymentPath = '/home/peter/.data/cryptoPayment/'

const storePayment = async (wallet: ethers.HDNodeWallet, price: number, cryptoName: string, realNumber: number, err: boolean) => {
    const obj = {address: wallet.address, privateKey: wallet.signingKey.privateKey, price, cryptoName, realNumber}
    const data = JSON.stringify(obj)
    const fileName = `${cryptoPaymentPath}${wallet.address}-${price}${err ? '.err.json' : '.json'}`
    await writeFileSync (fileName, data, 'utf8')
}

const waitingBNB = (wallet: ethers.HDNodeWallet, price: number) => new Promise(async executor => {
    
    const _balance = await bnbPrivate.getBalance(wallet.address)
    if (_balance === BigInt(0)) {
        let count = waitingList.get(wallet.address.toLowerCase()) ||0
        if (++ count > 40) {
            return logger(`waitingBNB ${wallet.address} time over STOP listening!`)
        }
        waitingList.set(wallet.address.toLowerCase(), count)
        return setTimeout(async () => {
            logger(`waitingBNB count [${count}] ${wallet.address.toLowerCase()} is ZERO do next waiting!`)
            return executor(await waitingBNB (wallet, price))
        }, 15 * 1000)
    }
    const balance = parseFloat(ethers.formatEther(_balance))

    if (Math.abs(balance-price) > price * 0.05) {
        logger(`waitingBNB price needed ${price} real got ${balance} Math.abs(balance-price) ${Math.abs(balance-price)} > price * 0.05 ${price * 0.05} Error!`)
        payment_waiting_status.set (wallet.address.toLowerCase(), 0)
        return storePayment(wallet, price, 'BNB', balance, true)
    }

    payment_waiting_status.set (wallet.address.toLowerCase(), 'asdcascsacasd4')
    storePayment(wallet, price, 'BNB', balance, false)
})

const listenTransfer = (wallet: ethers.HDNodeWallet, price: string, cryptoName: string) => {
    payment_waiting_status.set (wallet.address.toLowerCase(), 1)
    waitingBNB (wallet, parseFloat(price))
    
}

const getCryptoPay = (_agentWallet: string, cryptoName: string) => {
    const agentWallet = _agentWallet.toString()
    const index = agentWalletWhiteList.findIndex(n => n === agentWallet)
    if (index < 0) {
        return false
    }
    return getNextWallet()
}

const wallet_sp_reword = new ethers.Wallet( masterSetup.sp_reword, CONET_MAINNET)
const sp_reword_address = '0xEDea8558BA486e21180d7b9656A973cdE46593db'
const sp_reword_contract = new ethers.Contract(sp_reword_address, SP_Reward_ABI, wallet_sp_reword)

const sp_reword_sc_pool: ethers.Contract[] = []
sp_reword_sc_pool.push(sp_reword_contract)

const reword_pool: {wallet: string, solana: string}[] = []

const sp_reword_process = async () => {
    const SC = sp_reword_sc_pool.shift()
    if (!SC) {
        return
    }
    const obj = reword_pool.shift()
    if (!obj) {
        sp_reword_sc_pool.push(SC)
        return
    }

    try {
        const [tx, currentNFT] = await Promise.all([
            sp_reword_contract.mintReword(obj.wallet, obj.solana),
            payment_SC.getCurrntPasspurtNumber()
            
        ])
        
        await tx.wait()
        logger(`sp_reword_process ${obj.wallet}:${obj.solana} success, tx= ${tx.hash}`)
        payment_waiting_status.set(obj.wallet, parseInt(currentNFT.toString()) + 1)

    } catch (ex) {
        logger(Colors.red(`sp_reword_process Error! ${obj.wallet} `))
        payment_waiting_status.set(obj.wallet, 0)
    }

    sp_reword_sc_pool.push(SC)
    return sp_reword_process()
}

const spRewardCheck = async (wallet: string, solana: string) => {

    try {

        const [status, balance] = await Promise.all([
            sp_reword_contract.isReadyReword(wallet, solana),
            getBalance_SP(solana),
            getOracle()
        ])

        if (!oracleData.data) {
            return false
        }

        const price = parseInt(oracleData.data?.sp2499)
        if (balance < price) {
            return false
        }

        return status
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

const mintPassport_old = async () => {
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
			Payment_SCPool.push(SC)
			return mintPassport()
		}
		
		const ts = await SC.mintPassport(obj.walletAddress, obj.monthly ? 31 : 365, obj.hash)
		logger(`mintPassport ${ts.hash}`)
		await ts.wait()
		
		const [currentNFT, userInfo] = await Promise.all([
			SPManagermentcodeToClient.getCurrentPassport(obj.walletAddress),
			SPManagermentcodeToClient.getUserInfo(obj.walletAddress)
		])

		const currentID = parseInt(currentNFT[0])
		const _currentExpires = parseInt(currentNFT[1].toString())
		const userInfoArray = userInfo[0].length
		const lastNFT = userInfoArray - 1
		const newNFT = parseInt(userInfo[0][lastNFT> -1 ? lastNFT: 0].toString()||'0')
		//		
		payment_waiting_status.set(obj.walletAddress, newNFT)

		logger(`mintPassport new NFT is ${newNFT}`)
		if (typeof _currentExpires !== 'number') {
			Payment_SCPool.push(SC)
			return
		}

		const nftID = await getNextNft(obj.walletAddress, userInfo)
		if (nftID === currentID || nftID < 0) {
			Payment_SCPool.push(SC)
			return 
		}
		
		const tx = await SPManagermentcodeToClient._changeActiveNFT(obj.walletAddress, nftID)
		logger(`mintPassport _changeActiveNFT ${nftID} ${tx.hash}`)
		await tx.wait()
	} catch (ex: any) {
		payment_waiting_status.set(obj.walletAddress, 0)
		logger(`mintPassport Error! ${ex.message}`)
	}
	Payment_SCPool.push(SC)
	return mintPassport()
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
			Payment_SCPool.push(SC)
			return mintPassport()
		}

		const currentNFT: BigInt = await SC.getCurrntPasspurtNumber()
        payment_waiting_status.set(obj.walletAddress, parseInt(currentNFT.toString()) + 1)
		const ts = await SC.mintPassportAndActive(obj.walletAddress, obj.monthly ? 32 : 372, obj.hash)
		logger(`mintPassport ${ts.hash}`)
		await ts.wait()
		
        const appleID = applePayData.get (obj.hash)
        if (appleID) {
            const ts = await SC.applePayStatus(ethers.id(appleID.toString()), obj.walletAddress, obj.solanaWallet)
            logger(`mintPassport applePayStatus ${obj.walletAddress} ${ obj.solanaWallet}`)
            await ts.wait()
        }

	} catch (ex: any) {
		payment_waiting_status.set(obj.walletAddress, 0)
		logger(`mintPassport Error! ${ex.message}`)
	}
	Payment_SCPool.push(SC)
	return mintPassport()
}


const StripeMonthlyID = 'price_1RCRC4FmCrk3Nr7LyuweZ0bn'
const StripeAnnualID = 'price_1RCREGFmCrk3Nr7LeEDA5JIb'

const makePaymentLink = async (stripe: Stripe,  walletAddress: string, solanaWallet: string, price: number) => {
	const option: Stripe.PaymentLinkCreateParams = {
		line_items: [{
			price: price === 299 ? StripeMonthlyID: StripeAnnualID,
			quantity: 1
		}],
		subscription_data: {
			metadata:{walletAddress,solanaWallet}
		}
		
	}
	const paymentIntent = await stripe.paymentLinks.create(option)
	logger(inspect(paymentIntent, false, 3, true))
	return paymentIntent.url
}

const searchInvoices = async (stripe: Stripe, invoicesID: string) => {
	try {
		
		const paymentIntent = await stripe.invoices.retrieve(invoicesID)
		if (paymentIntent.status !== 'paid') {
			return false
		}
		const payAmount = paymentIntent.amount_paid
		logger(inspect(paymentIntent, false, 3, true))
		const metadata = paymentIntent.subscription_details?.metadata
		if ( !metadata?.solanaWallet|| !metadata?.walletAddress) {
			logger(inspect(paymentIntent))
			return logger(`stripe Invoices Error!`)
		}

		console.log(`PaymentIntent for ${paymentIntent.id} ${payAmount} was successful! wallets = ${inspect(metadata, false, 3, true)}`)
        const walletAddress = metadata.walletAddress.toLowerCase()
        payment_waiting_status.set(walletAddress, 1)
		mintPassportPool.push({
			walletAddress,
			solanaWallet: metadata.solanaWallet,
			monthly: payAmount === 299 ? true: false,
			total: 1,
			hash: paymentIntent.id
		})
		mintPassport()
        if (payAmount !== 299 && metadata.solanaWallet) {
            makeSolanaProm(metadata.solanaWallet)
        }
        
		
	} catch (ex: any) {
		logger(ex.message)
		return false
	}
}

let appleRootCAs: any = null

const appleVerificationUsage = async (transactionPayload: string): Promise<false|{plan: '001'|'002', hash: string}> => {
    const enableOnlineChecks = true
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
        if (transactionId) {
            const appleID = applePayData.get(transactionId)

            //      support PURCHASE 
            //      RENEWAL not support
            if ((plan == '001' || plan == '002') && appleID && verifiedTransaction.transactionReason === 'PURCHASE') {
                const ret = await checkApplePayTransactionId(transactionId)
                if (ret) {
                    return {plan, hash: transactionId}
                }
            }
        }
		
    } catch (ex: any) {
        logger(`appleVerificationUsage Error! ${ex.message}`)
    }
    return false
    
}

const applePayData: Map<string, number> = new Map()


const appleNotification = async (NotificationSignedPayload: string ) => {
	const enableOnlineChecks = true
    const appAppleId = 6740261324 // appAppleId is required when the environment is Production
	if (!appleRootCAs) {
		appleRootCAs = appleRoot.map(n => readFileSync(n))
	}
	const verifier = new SignedDataVerifier( appleRootCAs, enableOnlineChecks, environment, bundleId, appAppleId)
	try {
		const verifiedTransaction = await verifier.verifyAndDecodeNotification(NotificationSignedPayload)
		logger(inspect(verifiedTransaction, false, 3, true))
		const data = verifiedTransaction?.data
        if (data) {
			const appleID = data.appAppleId
			const signedRenewalInfo = data.signedRenewalInfo
			if (appleID && signedRenewalInfo) {
				const verifiedTransactionRenew = await verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo)
                if (verifiedTransactionRenew.originalTransactionId) {
                    
                    const getPassedWallet = await checkAppleID(appleID.toString())
                    if (getPassedWallet) {
                        const plan = verifiedTransactionRenew.productId
                        mintPassportPool.push({
                            walletAddress: getPassedWallet.walletAddress, solanaWallet: getPassedWallet.solanaWallet, total: 1,
                            monthly: plan === '001' ? true : false,
                            hash: verifiedTransactionRenew.originalTransactionId
                        })
                        return mintPassport()
                    }
                    logger(`appleNotification setup TransactionId [${verifiedTransactionRenew.originalTransactionId}]  ==> AppleID ${appleID}`)
                    applePayData.set (verifiedTransactionRenew.originalTransactionId, appleID)
                }
			}
		}
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

const appleReceipt = async (receipt: string, _walletAddress: string, solanaWallet: string): Promise<boolean> => {
	const encodedKey = readFileSync(filePath, 'binary')
	const client = new AppStoreServerAPIClient(encodedKey, keyId, issuerId, bundleId, environment)
	const receiptUtil = new ReceiptUtility()
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
               resoule.forEach(n => {
                    if (n) {
                        const walletAddress = _walletAddress.toLowerCase()
                        payment_waiting_status.set(walletAddress, 1)
                        logger(`appleReceipt start PURCHASE success ${walletAddress}`)
                        mintPassportPool.push({
                            walletAddress, solanaWallet, total: 1,
                            monthly: n.plan === '001' ? true : false,
                            hash: n.hash
                        })
                        mintPassport()
                        if (n.plan === '002') {
                            makeSolanaProm(solanaWallet)
                        }
                        return true
                    }
               })
			}
		} while (response.hasMore)
	}
    return false
}

const SOLANA_CONNECTION = new Connection(
	"https://api.mainnet-beta.solana.com" // We only support mainnet.
)

const solana_account = masterSetup.solana_return_manager
const solana_account_privatekeyArray = Bs58.decode(solana_account)
const solana_account_privatekey = Keypair.fromSecretKey(solana_account_privatekeyArray)
const SP_address = 'Bzr4aEQEXrk7k8mbZffrQ9VzX6V3PAH4LvWKXkKppump'

const spDecimalPlaces = 6
const solanaDecimalPlaces = 9
let oracleData: OracleData = {
	timeStamp: 0,
	data:null
}
const SP_Oracle_Addr = '0xA57Dc01fF9a340210E5ba6CF01b4EE6De8e50719'
const SP_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const returnPool: {
	from: string
	SP_amount: string
    So_amount: string
}[] = []
const CoNET_CancunRPC = 'https://cancun-rpc.conet.network'

const endPointCancun = new ethers.JsonRpcProvider(CoNET_CancunRPC)
const SP_Oracle_SC_reaonly = new ethers.Contract(SP_Oracle_Addr, SP_Oracle_ABI, endPointCancun)

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


const makeSolanaProm = async (solanaWallet: string) => {
    const getSP = await spRate()
    if (getSP.so == '0') {
        return logger(`makeSolanaProm getSP return NULL error!`, inspect(solanaWallet, false, 3, true))
    }

    returnPool.push({
        from: solanaWallet,
        SP_amount: getSP.sp,
        So_amount: getSP.so
    })
    returnSP_Pool_process()
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


const returnSP = async (to: string, SP_Amount: string, Sol_Amount: string) => {
    const to_address = new PublicKey(to)
    try {
        const sourceAccount = await getOrCreateAssociatedTokenAccount(
            SOLANA_CONNECTION, 
            solana_account_privatekey,
            SP_Address,
            solana_account_privatekey.publicKey
        )

        const destinationAccount = await getOrCreateAssociatedTokenAccount(
            SOLANA_CONNECTION, 
            solana_account_privatekey,
            SP_Address,
            to_address
        )

        const transferInstructionSP = createTransferInstruction(
            sourceAccount.address,
            destinationAccount.address,
            solana_account_privatekey.publicKey,
            BigInt(SP_Amount)
        )

        const transferInstructionSol = SystemProgram.transfer({
            fromPubkey: solana_account_privatekey.publicKey,
            toPubkey: new PublicKey(to),
            lamports: BigInt(Sol_Amount),
        })


        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 200000
        })
        
        const tx = new Transaction().add(modifyComputeUnits).add(addPriorityFee)
        tx.add (transferInstructionSP)
        tx.add (transferInstructionSol)

		
        const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash('confirmed')
        tx.recentBlockhash = latestBlockHash.blockhash
        
        const transactionSignature = await SOLANA_CONNECTION.sendTransaction(tx, [solana_account_privatekey])
        logger(Colors.magenta(`returnSP from ${solana_account_privatekey.publicKey} SP = ${ethers.formatUnits(SP_Amount, spDecimalPlaces)} Sol = ${ethers.parseUnits(Sol_Amount, solanaDecimalPlaces)} hash = ${transactionSignature} success!`))
    } catch (ex: any) {
        logger(Colors.magenta(`returnSP from ${solana_account_privatekey.publicKey} SP = ${ethers.formatUnits(SP_Amount, spDecimalPlaces)} Sol = ${ethers.parseUnits(Sol_Amount, solanaDecimalPlaces)} Error! ${ex.message}`))
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
}

const getBalance_SP = async (solanaWallet: string) => {
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
    const ret: any = await HTTPS_PostTohost_JSON('api.mainnet-beta.solana.com', '/', payload)
    const tokenAccounts = ret?.result?.value ?? [];
    let balance = 0
    logger(inspect(tokenAccounts, false, 4, true))
    for (let account of tokenAccounts) {
      const info = account.account.data.parsed.info;

      if (info.mint === SP_address) {
        balance = info.tokenAmount.uiAmount; // Return balance in tokens
        logger(inspect(info.tokenAmount, false, 3, true))
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

// const returnSo = async(to: string, amount: string) => {
    
    
//     const units = await getSimulationComputeUnits(SOLANA_CONNECTION, [transferInstruction], solana_account_privatekey.publicKey, [])

//     const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
//         units: units||2000000
//     })

//     const tx = new Transaction().add(modifyComputeUnits).add(addPriorityFee)

//     tx.add(transferInstruction)
    
//     const latestBlockHash = await SOLANA_CONNECTION.getLatestBlockhash('confirmed')
// 	tx.recentBlockhash = await latestBlockHash.blockhash

//     const blockhashResponse = await SOLANA_CONNECTION.getLatestBlockhashAndContext();
//     const lastValidBlockHeight = blockhashResponse.context.slot + 150
//     const rawTransaction = tx.serialize()
//     let blockheight = await SOLANA_CONNECTION.getBlockHeight()
//     logger(`returnSo tx.recentBlockhash = ${tx.recentBlockhash} lastValidBlockHeight = ${lastValidBlockHeight}`) 
//     while (blockheight < lastValidBlockHeight) {
//         SOLANA_CONNECTION.sendRawTransaction(rawTransaction, {
//             skipPreflight: true,
//         })
//         await sleepWaiting (500)
//         blockheight = await SOLANA_CONNECTION.getBlockHeight()
//     }

//     logger(inspect({LAMPORTS_PER_SOL, lamportsToSend}, false, 3, true))
    
// }

let returnSP_Pool_processing = false

const returnSP_Pool_process = async () => {
	if (returnSP_Pool_processing) {
        return
    }
    
	const returnData = returnPool.shift()
	if (!returnData) {
		return
	}
    returnSP_Pool_processing = true
    await returnSP (returnData.from, returnData.SP_amount, returnData.So_amount)
	returnSP_Pool_processing = false
    logger(inspect(returnData, false, 3, true))
	returnSP_Pool_process()
}

// const testApple = async () => {
//     const clientReceipt = `MIIUWgYJKoZIhvcNAQcCoIIUSzCCFEcCAQExDzANBglghkgBZQMEAgEFADCCA5AGCSqGSIb3DQEHAaCCA4EEggN9MYIDeTAKAgEIAgEBBAIWADAKAgEUAgEBBAIMADALAgEBAgEBBAMCAQAwCwIBCwIBAQQDAgEAMAsCAQ8CAQEEAwIBADALAgEQAgEBBAMCAQAwCwIBGQIBAQQDAgEDMAwCAQoCAQEEBBYCNCswDAIBDgIBAQQEAgIA4TANAgENAgEBBAUCAwLAsDANAgETAgEBBAUMAzEuMDAOAgEJAgEBBAYCBFAzMDUwEQIBAwIBAQQJDAcxLjAuOTk5MBgCAQQCAQIEEF6aDwipmh7qIumy+fxvyXkwGwIBAAIBAQQTDBFQcm9kdWN0aW9uU2FuZGJveDAcAgEFAgEBBBT/NOVuVfrY3CkLyyRRqKy4WWaDDTAeAgEMAgEBBBYWFDIwMjUtMDQtMTFUMDc6MTc6NTlaMB4CARICAQEEFhYUMjAxMy0wOC0wMVQwNzowMDowMFowJwIBAgIBAQQfDB1jb20uZngxNjguQ29ORVRWUE4xLkNvTkVUVlBOMTA4AgEGAgEBBDDzFQLJuCt55/gJJ7wQ4S78QQVRyEiD5mKmMJp2W5x4anYSbCLXwFgd/ZayvDHz9dswRwIBBwIBAQQ/kFs2b8KemBBMiwP3SzQqO1KozutEpri3ooLp+ewmZ/AFtqQFsKuJ3tP3eU2qhGBa8duGsDZCgmUjV7k4w4dtMIIBfgIBEQIBAQSCAXQxggFwMAsCAgatAgEBBAIMADALAgIGsAIBAQQCFgAwCwICBrICAQEEAgwAMAsCAgazAgEBBAIMADALAgIGtAIBAQQCDAAwCwICBrUCAQEEAgwAMAsCAga2AgEBBAIMADAMAgIGpQIBAQQDAgEBMAwCAgarAgEBBAMCAQMwDAICBq4CAQEEAwIBADAMAgIGsQIBAQQDAgEAMAwCAga3AgEBBAMCAQAwDAICBroCAQEEAwIBADAOAgIGpgIBAQQFDAMwMDEwEgICBq8CAQEECQIHBxr9T0kL6DAbAgIGpwIBAQQSDBAyMDAwMDAwODk1NzAwMDcxMBsCAgapAgEBBBIMEDIwMDAwMDA4OTU3MDAwNzEwHwICBqgCAQEEFhYUMjAyNS0wNC0xMVQwNzoxNzo1OFowHwICBqoCAQEEFhYUMjAyNS0wNC0xMVQwNzoxNzo1OVowHwICBqwCAQEEFhYUMjAyNS0wNC0xMVQwODoxNzo1OFqggg7iMIIFxjCCBK6gAwIBAgIQfTkgCU6+8/jvymwQ6o5DAzANBgkqhkiG9w0BAQsFADB1MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzUxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYTAlVTMB4XDTI0MDcyNDE0NTAwM1oXDTI2MDgyMzE0NTAwMlowgYkxNzA1BgNVBAMMLk1hYyBBcHAgU3RvcmUgYW5kIGlUdW5lcyBTdG9yZSBSZWNlaXB0IFNpZ25pbmcxLDAqBgNVBAsMI0FwcGxlIFdvcmxkd2lkZSBEZXZlbG9wZXIgUmVsYXRpb25zMRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAK0PNpvPN9qBcVvW8RT8GdP11PA3TVxGwpopR1FhvrE/mFnsHBe6r7MJVwVE1xdtXdIwwrszodSJ9HY5VlctNT9NqXiC0Vph1nuwLpVU8Ae/YOQppDM9R692j10Dm5o4CiHM3xSXh9QdYcoqjcQ+Va58nWIAsAoYObjmHY3zpDDxlJNj2xPpPI4p/dWIc7MUmG9zyeIz1Sf2tuN11urOq9/i+Ay+WYrtcHqukgXZTAcg5W1MSHTQPv5gdwF5PhM7f4UAz5V/gl2UIDTrknW1BkH7n5mXJLrvutiZSvR3LnnYON6j2C9FUETkMyKZ1fflnIT5xgQRy+BV4TTLFbIjFaUCAwEAAaOCAjswggI3MAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUGYuXjUpbYXhX9KVcNRKKOQjjsHUwcAYIKwYBBQUHAQEEZDBiMC0GCCsGAQUFBzAChiFodHRwOi8vY2VydHMuYXBwbGUuY29tL3d3ZHJnNS5kZXIwMQYIKwYBBQUHMAGGJWh0dHA6Ly9vY3NwLmFwcGxlLmNvbS9vY3NwMDMtd3dkcmc1MDUwggEfBgNVHSAEggEWMIIBEjCCAQ4GCiqGSIb3Y2QFBgEwgf8wNwYIKwYBBQUHAgEWK2h0dHBzOi8vd3d3LmFwcGxlLmNvbS9jZXJ0aWZpY2F0ZWF1dGhvcml0eS8wgcMGCCsGAQUFBwICMIG2DIGzUmVsaWFuY2Ugb24gdGhpcyBjZXJ0aWZpY2F0ZSBieSBhbnkgcGFydHkgYXNzdW1lcyBhY2NlcHRhbmNlIG9mIHRoZSB0aGVuIGFwcGxpY2FibGUgc3RhbmRhcmQgdGVybXMgYW5kIGNvbmRpdGlvbnMgb2YgdXNlLCBjZXJ0aWZpY2F0ZSBwb2xpY3kgYW5kIGNlcnRpZmljYXRpb24gcHJhY3RpY2Ugc3RhdGVtZW50cy4wMAYDVR0fBCkwJzAloCOgIYYfaHR0cDovL2NybC5hcHBsZS5jb20vd3dkcmc1LmNybDAdBgNVHQ4EFgQU7yhXtGCISVUx8P1YDvH9GpPEJPwwDgYDVR0PAQH/BAQDAgeAMBAGCiqGSIb3Y2QGCwEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA1I9K7UL82Z8wANUR8ipOnxF6fuUTqckfPEIa6HO0KdR5ZMHWFyiJ1iUIL4Zxw5T6lPHqQ+D8SrHNMJFiZLt+B8Q8lpg6lME6l5rDNU3tFS7DmWzow1rT0K1KiD0/WEyOCM+YthZFQfDHUSHGU+giV7p0AZhq55okMjrGJfRZKsIgVHRQphxQdMfquagDyPZFjW4CCSB4+StMC3YZdzXLiNzyoCyW7Y9qrPzFlqCcb8DtTRR0SfkYfxawfyHOcmPg0sGB97vMRDFaWPgkE5+3kHkdZsPCDNy77HMcTo2ly672YJpCEj25N/Ggp+01uGO3craq5xGmYFAj9+Uv7bP6ZMIIEVTCCAz2gAwIBAgIUO36ACu7TAqHm7NuX2cqsKJzxaZQwDQYJKoZIhvcNAQELBQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTIwMTIxNjE5Mzg1NloXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc1MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJ9d2h/7+rzQSyI8x9Ym+hf39J8ePmQRZprvXr6rNL2qLCFu1h6UIYUsdMEOEGGqPGNKfkrjyHXWz8KcCEh7arkpsclm/ciKFtGyBDyCuoBs4v8Kcuus/jtvSL6eixFNlX2ye5AvAhxO/Em+12+1T754xtress3J2WYRO1rpCUVziVDUTuJoBX7adZxLAa7a489tdE3eU9DVGjiCOtCd410pe7GB6iknC/tgfIYS+/BiTwbnTNEf2W2e7XPaeCENnXDZRleQX2eEwXN3CqhiYraucIa7dSOJrXn25qTU/YMmMgo7JJJbIKGc0S+AGJvdPAvntf3sgFcPF54/K4cnu/cCAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJvb3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290LmNybDAdBgNVHQ4EFgQUGYuXjUpbYXhX9KVcNRKKOQjjsHUwDgYDVR0PAQH/BAQDAgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQBaxDWi2eYKnlKiAIIid81yL5D5Iq8UJcyqCkJgksK9dR3rTMoV5X5rQBBe+1tFdA3wen2Ikc7eY4tCidIY30GzWJ4GCIdI3UCvI9Xt6yxg5eukfxzpnIPWlF9MYjmKTq4TjX1DuNxerL4YQPLmDyxdE5Pxe2WowmhI3v+0lpsM+zI2np4NlV84CouW0hJst4sLjtc+7G8Bqs5NRWDbhHFmYuUZZTDNiv9FU/tu+4h3Q8NIY/n3UbNyXnniVs+8u4S5OFp4rhFIUrsNNYuU3sx0mmj1SWCUrPKosxWGkNDMMEOG0+VwAlG0gcCol9Tq6rCMCUDvOJOyzSID62dDZchFMIIEuzCCA6OgAwIBAgIBAjANBgkqhkiG9w0BAQUFADBiMQswCQYDVQQGEwJVUzETMBEGA1UEChMKQXBwbGUgSW5jLjEmMCQGA1UECxMdQXBwbGUgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxFjAUBgNVBAMTDUFwcGxlIFJvb3QgQ0EwHhcNMDYwNDI1MjE0MDM2WhcNMzUwMjA5MjE0MDM2WjBiMQswCQYDVQQGEwJVUzETMBEGA1UEChMKQXBwbGUgSW5jLjEmMCQGA1UECxMdQXBwbGUgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxFjAUBgNVBAMTDUFwcGxlIFJvb3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDkkakJH5HbHkdQ6wXtXnmELes2oldMVeyLGYne+Uts9QerIjAC6Bg++FAJ039BqJj50cpmnCRrEdCju+QbKsMflZ56DKRHi1vUFjczy8QPTc4UadHJGXL1XQ7Vf1+b8iUDulWPTV0N8WQ1IxVLFVkds5T39pyez1C6wVhQZ48ItCD3y6wsIG9wtj8BMIy3Q88PnT3zK0koGsj+zrW5DtleHNbLPbU6rfQPDgCSC7EhFi501TwN22IWq6NxkkdTVcGvL0Gz+PvjcM3mo0xFfh9Ma1CWQYnEdGILEINBhzOKgbEwWOxaBDKMaLOPHd5lc/9nXmW8Sdh2nzMUZaF3lMktAgMBAAGjggF6MIIBdjAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUK9BpR5R2Cf70a40uQKb3R01/CF4wHwYDVR0jBBgwFoAUK9BpR5R2Cf70a40uQKb3R01/CF4wggERBgNVHSAEggEIMIIBBDCCAQAGCSqGSIb3Y2QFATCB8jAqBggrBgEFBQcCARYeaHR0cHM6Ly93d3cuYXBwbGUuY29tL2FwcGxlY2EvMIHDBggrBgEFBQcCAjCBthqBs1JlbGlhbmNlIG9uIHRoaXMgY2VydGlmaWNhdGUgYnkgYW55IHBhcnR5IGFzc3VtZXMgYWNjZXB0YW5jZSBvZiB0aGUgdGhlbiBhcHBsaWNhYmxlIHN0YW5kYXJkIHRlcm1zIGFuZCBjb25kaXRpb25zIG9mIHVzZSwgY2VydGlmaWNhdGUgcG9saWN5IGFuZCBjZXJ0aWZpY2F0aW9uIHByYWN0aWNlIHN0YXRlbWVudHMuMA0GCSqGSIb3DQEBBQUAA4IBAQBcNplMLXi37Yyb3PN3m/J20ncwT8EfhYOFG5k9RzfyqZtAjizUsZAS2L70c5vu0mQPy3lPNNiiPvl4/2vIB+x9OYOLUyDTOMSxv5pPCmv/K/xZpwUJfBdAVhEedNO3iyM7R6PVbyTi69G3cN8PReEnyvFteO3ntRcXqNx+IjXKJdXZD9Zr1KIkIxH3oayPc4FgxhtbCS+SsvhESPBgOJ4V9T0mZyCKM2r3DYLP3uujL/lTaltkwGMzd/c6ByxW69oPIQ7aunMZT7XZNn/Bh1XZp5m5MkL72NVxnn6hUrcbvZNCJBIqxw8dtk2cXmPIS4AXUKqK1drk/NAJBzewdXUhMYIBtTCCAbECAQEwgYkwdTFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc1MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUwIQfTkgCU6+8/jvymwQ6o5DAzANBglghkgBZQMEAgEFADANBgkqhkiG9w0BAQEFAASCAQCX1kdqA6Ry4/XmJ/pb2gay5sIPP20gE3Rwp1eRgVDNuGXNfp3My1h4wd1App232QRjntJigsY51cra15YRy/k5a1WudzzQCS7Ibik/2vl6GihZYAT5cGw7VU94IH7YN0M2FZIYGZwxcqkMtUJd+J840RSI9U0IKlSgZAI0ovSr75DYWhB0/rJOPl7K5dx0XEzxzprdkzCdkJzgrpBNb0G3/7V+GyS4iRnhXRdg9PUrSwDUEag8TCifmCgzmaNRlcFePGD2PskEsOUs7TyKJybgaEh+fS+LZdJ+BA8XoFqZbj/erdJkIkH1fzSdQEBPlI3acMeTgIPq9AW/mIzmqOmM`
// 	const receiptRenew = `eyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlFTURDQ0E3YWdBd0lCQWdJUWZUbGZkMGZOdkZXdnpDMVlJQU5zWGpBS0JnZ3Foa2pPUFFRREF6QjFNVVF3UWdZRFZRUURERHRCY0hCc1pTQlhiM0pzWkhkcFpHVWdSR1YyWld4dmNHVnlJRkpsYkdGMGFXOXVjeUJEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURUxNQWtHQTFVRUN3d0NSell4RXpBUkJnTlZCQW9NQ2tGd2NHeGxJRWx1WXk0eEN6QUpCZ05WQkFZVEFsVlRNQjRYRFRJek1Ea3hNakU1TlRFMU0xb1hEVEkxTVRBeE1URTVOVEUxTWxvd2daSXhRREErQmdOVkJBTU1OMUJ5YjJRZ1JVTkRJRTFoWXlCQmNIQWdVM1J2Y21VZ1lXNWtJR2xVZFc1bGN5QlRkRzl5WlNCU1pXTmxhWEIwSUZOcFoyNXBibWN4TERBcUJnTlZCQXNNSTBGd2NHeGxJRmR2Y214a2QybGtaU0JFWlhabGJHOXdaWElnVW1Wc1lYUnBiMjV6TVJNd0VRWURWUVFLREFwQmNIQnNaU0JKYm1NdU1Rc3dDUVlEVlFRR0V3SlZVekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCRUZFWWUvSnFUcXlRdi9kdFhrYXVESENTY1YxMjlGWVJWLzB4aUIyNG5DUWt6UWYzYXNISk9OUjVyMFJBMGFMdko0MzJoeTFTWk1vdXZ5ZnBtMjZqWFNqZ2dJSU1JSUNCREFNQmdOVkhSTUJBZjhFQWpBQU1COEdBMVVkSXdRWU1CYUFGRDh2bENOUjAxREptaWc5N2JCODVjK2xrR0taTUhBR0NDc0dBUVVGQndFQkJHUXdZakF0QmdnckJnRUZCUWN3QW9ZaGFIUjBjRG92TDJObGNuUnpMbUZ3Y0d4bExtTnZiUzkzZDJSeVp6WXVaR1Z5TURFR0NDc0dBUVVGQnpBQmhpVm9kSFJ3T2k4dmIyTnpjQzVoY0hCc1pTNWpiMjB2YjJOemNEQXpMWGQzWkhKbk5qQXlNSUlCSGdZRFZSMGdCSUlCRlRDQ0FSRXdnZ0VOQmdvcWhraUc5Mk5rQlFZQk1JSCtNSUhEQmdnckJnRUZCUWNDQWpDQnRneUJzMUpsYkdsaGJtTmxJRzl1SUhSb2FYTWdZMlZ5ZEdsbWFXTmhkR1VnWW5rZ1lXNTVJSEJoY25SNUlHRnpjM1Z0WlhNZ1lXTmpaWEIwWVc1alpTQnZaaUIwYUdVZ2RHaGxiaUJoY0hCc2FXTmhZbXhsSUhOMFlXNWtZWEprSUhSbGNtMXpJR0Z1WkNCamIyNWthWFJwYjI1eklHOW1JSFZ6WlN3Z1kyVnlkR2xtYVdOaGRHVWdjRzlzYVdONUlHRnVaQ0JqWlhKMGFXWnBZMkYwYVc5dUlIQnlZV04wYVdObElITjBZWFJsYldWdWRITXVNRFlHQ0NzR0FRVUZCd0lCRmlwb2RIUndPaTh2ZDNkM0xtRndjR3hsTG1OdmJTOWpaWEowYVdacFkyRjBaV0YxZEdodmNtbDBlUzh3SFFZRFZSME9CQllFRkFNczhQanM2VmhXR1FsekUyWk9FK0dYNE9vL01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBUUJnb3Foa2lHOTJOa0Jnc0JCQUlGQURBS0JnZ3Foa2pPUFFRREF3Tm9BREJsQWpFQTh5Uk5kc2twNTA2REZkUExnaExMSndBdjVKOGhCR0xhSThERXhkY1BYK2FCS2pqTzhlVW85S3BmcGNOWVVZNVlBakFQWG1NWEVaTCtRMDJhZHJtbXNoTnh6M05uS20rb3VRd1U3dkJUbjBMdmxNN3ZwczJZc2xWVGFtUllMNGFTczVrPSIsIk1JSURGakNDQXB5Z0F3SUJBZ0lVSXNHaFJ3cDBjMm52VTRZU3ljYWZQVGp6Yk5jd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NakV3TXpFM01qQXpOekV3V2hjTk16WXdNekU1TURBd01EQXdXakIxTVVRd1FnWURWUVFERER0QmNIQnNaU0JYYjNKc1pIZHBaR1VnUkdWMlpXeHZjR1Z5SUZKbGJHRjBhVzl1Y3lCRFpYSjBhV1pwWTJGMGFXOXVJRUYxZEdodmNtbDBlVEVMTUFrR0ExVUVDd3dDUnpZeEV6QVJCZ05WQkFvTUNrRndjR3hsSUVsdVl5NHhDekFKQmdOVkJBWVRBbFZUTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVic1FLQzk0UHJsV21aWG5YZ3R4emRWSkw4VDBTR1luZ0RSR3BuZ24zTjZQVDhKTUViN0ZEaTRiQm1QaENuWjMvc3E2UEYvY0djS1hXc0w1dk90ZVJoeUo0NXgzQVNQN2NPQithYW85MGZjcHhTdi9FWkZibmlBYk5nWkdoSWhwSW80SDZNSUgzTUJJR0ExVWRFd0VCL3dRSU1BWUJBZjhDQVFBd0h3WURWUjBqQkJnd0ZvQVV1N0Rlb1ZnemlKcWtpcG5ldnIzcnI5ckxKS3N3UmdZSUt3WUJCUVVIQVFFRU9qQTRNRFlHQ0NzR0FRVUZCekFCaGlwb2RIUndPaTh2YjJOemNDNWhjSEJzWlM1amIyMHZiMk56Y0RBekxXRndjR3hsY205dmRHTmhaek13TndZRFZSMGZCREF3TGpBc29DcWdLSVltYUhSMGNEb3ZMMk55YkM1aGNIQnNaUzVqYjIwdllYQndiR1Z5YjI5MFkyRm5NeTVqY213d0hRWURWUjBPQkJZRUZEOHZsQ05SMDFESm1pZzk3YkI4NWMrbGtHS1pNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQUtCZ2dxaGtqT1BRUURBd05vQURCbEFqQkFYaFNxNUl5S29nTUNQdHc0OTBCYUI2NzdDYUVHSlh1ZlFCL0VxWkdkNkNTamlDdE9udU1UYlhWWG14eGN4ZmtDTVFEVFNQeGFyWlh2TnJreFUzVGtVTUkzM3l6dkZWVlJUNHd4V0pDOTk0T3NkY1o0K1JHTnNZRHlSNWdtZHIwbkRHZz0iLCJNSUlDUXpDQ0FjbWdBd0lCQWdJSUxjWDhpTkxGUzVVd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NVFF3TkRNd01UZ3hPVEEyV2hjTk16a3dORE13TVRneE9UQTJXakJuTVJzd0dRWURWUVFEREJKQmNIQnNaU0JTYjI5MElFTkJJQzBnUnpNeEpqQWtCZ05WQkFzTUhVRndjR3hsSUVObGNuUnBabWxqWVhScGIyNGdRWFYwYUc5eWFYUjVNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVFzd0NRWURWUVFHRXdKVlV6QjJNQkFHQnlxR1NNNDlBZ0VHQlN1QkJBQWlBMklBQkpqcEx6MUFjcVR0a3lKeWdSTWMzUkNWOGNXalRuSGNGQmJaRHVXbUJTcDNaSHRmVGpqVHV4eEV0WC8xSDdZeVlsM0o2WVJiVHpCUEVWb0EvVmhZREtYMUR5eE5CMGNUZGRxWGw1ZHZNVnp0SzUxN0lEdll1VlRaWHBta09sRUtNYU5DTUVBd0hRWURWUjBPQkJZRUZMdXczcUZZTTRpYXBJcVozcjY5NjYvYXl5U3JNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTURBMmdBTUdVQ01RQ0Q2Y0hFRmw0YVhUUVkyZTN2OUd3T0FFWkx1Tit5UmhIRkQvM21lb3locG12T3dnUFVuUFdUeG5TNGF0K3FJeFVDTUcxbWloREsxQTNVVDgyTlF6NjBpbU9sTTI3amJkb1h0MlFmeUZNbStZaGlkRGtMRjF2TFVhZ002QmdENTZLeUtBPT0iXX0.eyJvcmlnaW5hbFRyYW5zYWN0aW9uSWQiOiIyMDAwMDAwODk1NzAwMDcxIiwiYXV0b1JlbmV3UHJvZHVjdElkIjoiMDAxIiwicHJvZHVjdElkIjoiMDAxIiwiYXV0b1JlbmV3U3RhdHVzIjoxLCJyZW5ld2FsUHJpY2UiOjMyOTAsImN1cnJlbmN5IjoiVVNEIiwic2lnbmVkRGF0ZSI6MTc0NDM1NTg5MTIxNCwiZW52aXJvbm1lbnQiOiJTYW5kYm94IiwicmVjZW50U3Vic2NyaXB0aW9uU3RhcnREYXRlIjoxNzQ0MzU1ODc4MDAwLCJyZW5ld2FsRGF0ZSI6MTc0NDM1OTQ3ODAwMCwiYXBwVHJhbnNhY3Rpb25JZCI6IjcwNDQwNDYyNDI3OTg0MTczNyJ9.v4T8IaGtaKI2weaHOx7maGU_NmNIPNayYux9ARQpyEqMQsC0tP5S74ZasPZSCy4yATEm6vxEu8RCUQk9ngVrTw`
// 	const signedTransactionInfo= `eyJhbGciOiJFUzI1NiIsIng1YyI6WyJNSUlFTURDQ0E3YWdBd0lCQWdJUWZUbGZkMGZOdkZXdnpDMVlJQU5zWGpBS0JnZ3Foa2pPUFFRREF6QjFNVVF3UWdZRFZRUURERHRCY0hCc1pTQlhiM0pzWkhkcFpHVWdSR1YyWld4dmNHVnlJRkpsYkdGMGFXOXVjeUJEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURUxNQWtHQTFVRUN3d0NSell4RXpBUkJnTlZCQW9NQ2tGd2NHeGxJRWx1WXk0eEN6QUpCZ05WQkFZVEFsVlRNQjRYRFRJek1Ea3hNakU1TlRFMU0xb1hEVEkxTVRBeE1URTVOVEUxTWxvd2daSXhRREErQmdOVkJBTU1OMUJ5YjJRZ1JVTkRJRTFoWXlCQmNIQWdVM1J2Y21VZ1lXNWtJR2xVZFc1bGN5QlRkRzl5WlNCU1pXTmxhWEIwSUZOcFoyNXBibWN4TERBcUJnTlZCQXNNSTBGd2NHeGxJRmR2Y214a2QybGtaU0JFWlhabGJHOXdaWElnVW1Wc1lYUnBiMjV6TVJNd0VRWURWUVFLREFwQmNIQnNaU0JKYm1NdU1Rc3dDUVlEVlFRR0V3SlZVekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCRUZFWWUvSnFUcXlRdi9kdFhrYXVESENTY1YxMjlGWVJWLzB4aUIyNG5DUWt6UWYzYXNISk9OUjVyMFJBMGFMdko0MzJoeTFTWk1vdXZ5ZnBtMjZqWFNqZ2dJSU1JSUNCREFNQmdOVkhSTUJBZjhFQWpBQU1COEdBMVVkSXdRWU1CYUFGRDh2bENOUjAxREptaWc5N2JCODVjK2xrR0taTUhBR0NDc0dBUVVGQndFQkJHUXdZakF0QmdnckJnRUZCUWN3QW9ZaGFIUjBjRG92TDJObGNuUnpMbUZ3Y0d4bExtTnZiUzkzZDJSeVp6WXVaR1Z5TURFR0NDc0dBUVVGQnpBQmhpVm9kSFJ3T2k4dmIyTnpjQzVoY0hCc1pTNWpiMjB2YjJOemNEQXpMWGQzWkhKbk5qQXlNSUlCSGdZRFZSMGdCSUlCRlRDQ0FSRXdnZ0VOQmdvcWhraUc5Mk5rQlFZQk1JSCtNSUhEQmdnckJnRUZCUWNDQWpDQnRneUJzMUpsYkdsaGJtTmxJRzl1SUhSb2FYTWdZMlZ5ZEdsbWFXTmhkR1VnWW5rZ1lXNTVJSEJoY25SNUlHRnpjM1Z0WlhNZ1lXTmpaWEIwWVc1alpTQnZaaUIwYUdVZ2RHaGxiaUJoY0hCc2FXTmhZbXhsSUhOMFlXNWtZWEprSUhSbGNtMXpJR0Z1WkNCamIyNWthWFJwYjI1eklHOW1JSFZ6WlN3Z1kyVnlkR2xtYVdOaGRHVWdjRzlzYVdONUlHRnVaQ0JqWlhKMGFXWnBZMkYwYVc5dUlIQnlZV04wYVdObElITjBZWFJsYldWdWRITXVNRFlHQ0NzR0FRVUZCd0lCRmlwb2RIUndPaTh2ZDNkM0xtRndjR3hsTG1OdmJTOWpaWEowYVdacFkyRjBaV0YxZEdodmNtbDBlUzh3SFFZRFZSME9CQllFRkFNczhQanM2VmhXR1FsekUyWk9FK0dYNE9vL01BNEdBMVVkRHdFQi93UUVBd0lIZ0RBUUJnb3Foa2lHOTJOa0Jnc0JCQUlGQURBS0JnZ3Foa2pPUFFRREF3Tm9BREJsQWpFQTh5Uk5kc2twNTA2REZkUExnaExMSndBdjVKOGhCR0xhSThERXhkY1BYK2FCS2pqTzhlVW85S3BmcGNOWVVZNVlBakFQWG1NWEVaTCtRMDJhZHJtbXNoTnh6M05uS20rb3VRd1U3dkJUbjBMdmxNN3ZwczJZc2xWVGFtUllMNGFTczVrPSIsIk1JSURGakNDQXB5Z0F3SUJBZ0lVSXNHaFJ3cDBjMm52VTRZU3ljYWZQVGp6Yk5jd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NakV3TXpFM01qQXpOekV3V2hjTk16WXdNekU1TURBd01EQXdXakIxTVVRd1FnWURWUVFERER0QmNIQnNaU0JYYjNKc1pIZHBaR1VnUkdWMlpXeHZjR1Z5SUZKbGJHRjBhVzl1Y3lCRFpYSjBhV1pwWTJGMGFXOXVJRUYxZEdodmNtbDBlVEVMTUFrR0ExVUVDd3dDUnpZeEV6QVJCZ05WQkFvTUNrRndjR3hsSUVsdVl5NHhDekFKQmdOVkJBWVRBbFZUTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVic1FLQzk0UHJsV21aWG5YZ3R4emRWSkw4VDBTR1luZ0RSR3BuZ24zTjZQVDhKTUViN0ZEaTRiQm1QaENuWjMvc3E2UEYvY0djS1hXc0w1dk90ZVJoeUo0NXgzQVNQN2NPQithYW85MGZjcHhTdi9FWkZibmlBYk5nWkdoSWhwSW80SDZNSUgzTUJJR0ExVWRFd0VCL3dRSU1BWUJBZjhDQVFBd0h3WURWUjBqQkJnd0ZvQVV1N0Rlb1ZnemlKcWtpcG5ldnIzcnI5ckxKS3N3UmdZSUt3WUJCUVVIQVFFRU9qQTRNRFlHQ0NzR0FRVUZCekFCaGlwb2RIUndPaTh2YjJOemNDNWhjSEJzWlM1amIyMHZiMk56Y0RBekxXRndjR3hsY205dmRHTmhaek13TndZRFZSMGZCREF3TGpBc29DcWdLSVltYUhSMGNEb3ZMMk55YkM1aGNIQnNaUzVqYjIwdllYQndiR1Z5YjI5MFkyRm5NeTVqY213d0hRWURWUjBPQkJZRUZEOHZsQ05SMDFESm1pZzk3YkI4NWMrbGtHS1pNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQUtCZ2dxaGtqT1BRUURBd05vQURCbEFqQkFYaFNxNUl5S29nTUNQdHc0OTBCYUI2NzdDYUVHSlh1ZlFCL0VxWkdkNkNTamlDdE9udU1UYlhWWG14eGN4ZmtDTVFEVFNQeGFyWlh2TnJreFUzVGtVTUkzM3l6dkZWVlJUNHd4V0pDOTk0T3NkY1o0K1JHTnNZRHlSNWdtZHIwbkRHZz0iLCJNSUlDUXpDQ0FjbWdBd0lCQWdJSUxjWDhpTkxGUzVVd0NnWUlLb1pJemowRUF3TXdaekViTUJrR0ExVUVBd3dTUVhCd2JHVWdVbTl2ZENCRFFTQXRJRWN6TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd0hoY05NVFF3TkRNd01UZ3hPVEEyV2hjTk16a3dORE13TVRneE9UQTJXakJuTVJzd0dRWURWUVFEREJKQmNIQnNaU0JTYjI5MElFTkJJQzBnUnpNeEpqQWtCZ05WQkFzTUhVRndjR3hsSUVObGNuUnBabWxqWVhScGIyNGdRWFYwYUc5eWFYUjVNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVFzd0NRWURWUVFHRXdKVlV6QjJNQkFHQnlxR1NNNDlBZ0VHQlN1QkJBQWlBMklBQkpqcEx6MUFjcVR0a3lKeWdSTWMzUkNWOGNXalRuSGNGQmJaRHVXbUJTcDNaSHRmVGpqVHV4eEV0WC8xSDdZeVlsM0o2WVJiVHpCUEVWb0EvVmhZREtYMUR5eE5CMGNUZGRxWGw1ZHZNVnp0SzUxN0lEdll1VlRaWHBta09sRUtNYU5DTUVBd0hRWURWUjBPQkJZRUZMdXczcUZZTTRpYXBJcVozcjY5NjYvYXl5U3JNQThHQTFVZEV3RUIvd1FGTUFNQkFmOHdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTURBMmdBTUdVQ01RQ0Q2Y0hFRmw0YVhUUVkyZTN2OUd3T0FFWkx1Tit5UmhIRkQvM21lb3locG12T3dnUFVuUFdUeG5TNGF0K3FJeFVDTUcxbWloREsxQTNVVDgyTlF6NjBpbU9sTTI3amJkb1h0MlFmeUZNbStZaGlkRGtMRjF2TFVhZ002QmdENTZLeUtBPT0iXX0.eyJ0cmFuc2FjdGlvbklkIjoiMjAwMDAwMDg5NTcxMTQ1OSIsIm9yaWdpbmFsVHJhbnNhY3Rpb25JZCI6IjIwMDAwMDA4OTU1ODQ1NDAiLCJ3ZWJPcmRlckxpbmVJdGVtSWQiOiIyMDAwMDAwMDk2MjA3MzA3IiwiYnVuZGxlSWQiOiJjb20uZngxNjguQ29ORVRWUE4xLkNvTkVUVlBOMSIsInByb2R1Y3RJZCI6IjAwMSIsInN1YnNjcmlwdGlvbkdyb3VwSWRlbnRpZmllciI6IjIxNjU0MzMzIiwicHVyY2hhc2VEYXRlIjoxNzQ0MzU2Mzk0MDAwLCJvcmlnaW5hbFB1cmNoYXNlRGF0ZSI6MTc0NDM0OTE2MjAwMCwiZXhwaXJlc0RhdGUiOjE3NDQzNTgxOTQwMDAsInF1YW50aXR5IjoxLCJ0eXBlIjoiQXV0by1SZW5ld2FibGUgU3Vic2NyaXB0aW9uIiwiaW5BcHBPd25lcnNoaXBUeXBlIjoiUFVSQ0hBU0VEIiwic2lnbmVkRGF0ZSI6MTc0NDM1NjM2NDEwNSwiZW52aXJvbm1lbnQiOiJTYW5kYm94IiwidHJhbnNhY3Rpb25SZWFzb24iOiJSRU5FV0FMIiwic3RvcmVmcm9udCI6IkNBTiIsInN0b3JlZnJvbnRJZCI6IjE0MzQ1NSIsInByaWNlIjozOTkwLCJjdXJyZW5jeSI6IkNBRCIsImFwcFRyYW5zYWN0aW9uSWQiOiI3MDQ0MDczMTU5NDA2ODMxMjMifQ.0txnpzIrNajjDAyHtr8f7-ldIYNl-eJAFcOK93vaeDkAv5ltW0M1i_1Yr4n7-Pyxjys-cqHGc4A8_XMXjiQl5Q`
//     // await appleNotification(receiptRenew)
//     // await appleReceipt(clientReceipt, '0x42edA5d2cC859EB66F21646232C8BF2BeC902354', '79LG8KejFr1Hpn3mHd5ZLj7TmkQ4ucTFURFBZMydQzvd')
//     const kkk = await checkAppleID('6740261324')
//     logger(kkk)
// }




// new conet_dl_server()

// const test = async () => {
//     // const balance = await getBalance_SP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
//     // logger(inspect(balance, false, 3, true))

//     const kk = await spRewardCheck ('0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff', 'CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')
//     logger(inspect(kk, false, 3, true))
// }
// getBalance_SP('CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8')

// const testPaymentLink = async() => {
// 	const walletAddress = ''
// 	const solanaWallet = ''
// 	const stripe = new Stripe(masterSetup.stripe_SecretKey)
// 	const kk = await makePaymentLink(stripe, walletAddress, solanaWallet, 299)
// }

// testPaymentLink()
// appleReceipt(kk, kk1, kk2)

// logger(solana_account_privatekey.publicKey)
// spRate()

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/payment_stripe

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/applePayUser
//  curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0", "id":1,"method": "getRecentPrioritizationFees","params": [["A8Vk2LsNqKktabs4xPY4YUmYxBoDqcTdxY5em4EQm8v1"]]}'


new conet_dl_server ()
