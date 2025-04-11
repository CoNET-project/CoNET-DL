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

const fx168PublicKey = `0xB83A30169F696fc3B997F87eAfe85894235f7d77`.toLowerCase()

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
const PaymentPassport_addr = '0xD426f38a9162A5E6983b8665A60d9a9c8bde42B6'
const payment_SC = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, web2_wallet)
const payment_SC_readOnly = new ethers.Contract(PaymentPassport_addr, web2PaymentABI, CONET_MAINNET)
const Payment_SCPool: ethers.Contract[] = []
Payment_SCPool.push(payment_SC)

const payment_waiting_status: Map<string, number> = new Map()
const mintPassportPool: walletsProcess[]  = []

class conet_dl_server {

	private PORT = 8005
	private stripe = new Stripe(masterSetup.stripe_SecretKey)
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
			
			const status = payment_waiting_status.get(obj.walletAddress)
			if (!status) {
				logger(`/payment_stripe_waiting ${obj.walletAddress} got unknow status! ${status}`)
				return res.status(402).json({error: `No ${obj.walletAddress} status`}).end()
			}
			logger(`/payment_stripe_waiting ${obj.walletAddress} got ${status}`)
			return res.status(200).json({ status }).end()
		})

        router.post('/applePay', async (req: any, res: any) => {
            const body = req.body
            logger(`applePay!`)
            logger(inspect(body, false, 3, true))
			if (body.signedPayload) {
				appleNotification(body.signedPayload)
			}

            res.status(200).json({received: true}).end()
        })

		
		router.all ('*', (req: any, res: any) => {
			const ipaddress = getIpAddressFromForwardHeader(req)
			logger (Colors.grey(`Router /api get unknow router [${ ipaddress }] => ${ req.method } [http://${ req.headers.host }${ req.url }] STOP connect! ${inspect(req.body, false, 3, true)}`))
			res.status(404).end()
			return res.socket?.end().destroy()
		})
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
		
	} catch (ex: any) {
		logger(ex.message)
		return false
	}
}

new conet_dl_server()


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
        const hash = verifiedTransaction.transactionId
		
        //      support PURCHASE 
        //      RENEWAL not support
        if ((plan == '001' || plan == '002') && hash && verifiedTransaction.transactionReason === 'PURCHASE') {
            const ret = await checkApplePayTransactionId(hash)
            if (ret) {
                return {plan, hash}
            }
        }
    } catch (ex: any) {
        logger(`appleVerificationUsage Error! ${ex.message}`)
    }
    return false
    
}


const appleNotification = async (NotificationSignedPayload: string ) => {
	const enableOnlineChecks = true
    const appAppleId = 6740261324 // appAppleId is required when the environment is Production
	if (!appleRootCAs) {
		appleRootCAs = appleRoot.map(n => readFileSync(n))
	}
	const verifier = new SignedDataVerifier( appleRootCAs, enableOnlineChecks, environment, bundleId, appAppleId)
	try {
		const verifiedTransaction = await verifier.verifyAndDecodeNotification(NotificationSignedPayload)
        logger(inspect(verifiedTransaction, false, 3, true ))
    } catch (ex: any) {
        logger(`appleVerificationUsage Error! ${ex.message}`)
    }
    return false
}


const checkApplePayTransactionId = async (id: string) => {
    try {
        const isHash = await payment_SC_readOnly.getPayID(id)
        return !isHash
    } catch (ex) {
        
    }
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
                        // mintPassportPool.push({
                        //     walletAddress, solanaWallet, total: 1,
                        //     monthly: n.plan === '001' ? true : false,
                        //     hash: n.hash
                        // })
                        // mintPassport()
						
                        return true
                    }
               })
			}
		} while (response.hasMore)
	}
    return false
}

const testApple = async () => {
	const receipt = `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`
	await appleReceipt(receipt, '0x3Ba0A9F2EACe71caa30198A79A2C3731325F2e1b', 'Brc3SUCcAWFAzQUgZy5jzFDYdNVkUqm8tQousMB7KC9J')
}

// testApple()

// const testPaymentLink = async() => {
// 	const walletAddress = ''
// 	const solanaWallet = ''
// 	const stripe = new Stripe(masterSetup.stripe_SecretKey)
// 	const kk = await makePaymentLink(stripe, walletAddress, solanaWallet, 299)
// }

// testPaymentLink()
// appleReceipt(kk, kk1, kk2)
//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/payment_stripe

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/applePayUser