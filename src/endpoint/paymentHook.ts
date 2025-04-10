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
			if (!obj || obj?.walletAddress !== fx168PublicKey || !data?.walletAddress || !data?.solanaWallet || data?.type !== '1' || data?.type !== '2' || data?.hash ) {
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

			res.status(200).json({success: true})

		})

		router.post('/stripeHook', Express.raw({type: 'application/json'}), async (req: any, res: any) => {
			let event = req.body
			// if (this.endpointSecret) {
			// 	// Get the signature sent by Stripe
			// 	const signature = req.headers['stripe-signature']
			// 	try {
			// 	  event = this.stripe.webhooks.constructEvent(
			// 		req.body,
			// 		signature,
			// 		this.endpointSecret
			// 	  )
			// 	} catch (err: any) {
			// 	  logger(`⚠️  Webhook signature verification failed. ${signature}`, err.message)
			// 	  logger(inspect(req.body, false, 3, true))
			// 	  return res.sendStatus(400).end()
			// 	}
			// }

			  // Handle the event
			switch (event.type) {
				case 'invoice.payment_succeeded': {
					const paymentIntent: Stripe.Invoice = event.data.object
					searchInvoices (this.stripe, paymentIntent.id)
				}
				// case 'payment_intent.succeeded': {
				// 	const paymentIntent: Stripe.PaymentIntent = event.data.object

				// 	if (!paymentIntent.id) {
				// 		break
				// 	}

				// 	const pay = await searchInvoices(this.stripe, paymentIntent.id, paymentIntent.amount)
				// 	if (!pay) {
				// 		break
				// 	}

				// 	const successPay = paymentSuccess.get(paymentIntent.id)
				// 	if (successPay) {
				// 		break
				// 	}


				// 	paymentSuccess.set(paymentIntent.id, true)
				// 	res.status(200).json({received: true}).end()

				// 	let loop = 0
				// 	const waitingWallet = (): Promise<wallets|null> => new Promise(resolve => {
				// 		const wallets = paymentReference.get (paymentIntent.id)
				// 		if (!wallets) {
				// 			if (++loop > 10 ) {
				// 				logger(`PaymentIntent ++loop > 10  ERROR! no wallets in paymentReference!`)
				// 				return resolve(null)
				// 			}
				// 			return setTimeout (() => {
				// 				logger(`PaymentIntent no wallets in paymentReference! try again`)
				// 				return waitingWallet().then(_d => resolve (_d))
				// 			}, 2000)
				// 		}
				// 		return resolve(wallets)
				// 	})

				// 	const wallets = await waitingWallet ()

				// 	if (!wallets) {
				// 		return
				// 	}

				// 	console.log(`PaymentIntent for ${paymentIntent.id} ${paymentIntent.amount} was successful! wallets = ${inspect(wallets, false, 3, true)}`)
				// 	mintPasswordPool.push({
				// 		walletAddress: wallets.walletAddress,
				// 		solanaWallet: wallets.solanaWallet,
				// 		monthly: paymentIntent.amount === 299 ? true: false,
				// 		total: 1,
				// 		hash: paymentIntent.id
				// 	})
				// 	mintPassport()
				// 	return
				// }
				
				// case 'checkout.session.completed': {
				// 	const session: Stripe.Checkout.Session = event.data.object
				// 	//const client_reference_id = session.client_reference_id
				// 	const payment_intent = session.payment_intent
				// 	const walletAddress = session?.metadata?.walletAddress
				// 	const solanaWallet = session?.metadata?.solanaWallet
				// 	if ( !payment_intent || typeof payment_intent !== 'string' || !walletAddress||!solanaWallet) {
				// 		logger(`checkout.session.completed !payment_intent || !walletAddress||!solanaWallet Error!`)
				// 		break
				// 	}
				// 	paymentReference.set(payment_intent, {walletAddress, solanaWallet})
				// 	break
				// }

				

				default: {
					// Unexpected event type
					console.log(`Unhandled event type ${event.type}.`)
				}
				
			}

			// Return a 200 response to acknowledge receipt of the event
			logger(inspect(event, false, 3, true))
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
			payment_waiting_status.set(obj.walletAddress, 1)
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

const makePaymentLink = async (stripe: Stripe,  walletAddress: string, solanaWallet: string, price: number) => {
	const option: Stripe.PaymentLinkCreateParams = {
		line_items: [{
			price: price === 299 ? 'price_1R6bdoHIGHEZ9LgIwHsdgVaU': 'price_1R1Y7aHIGHEZ9LgIGffY433h',
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

const appleRootCAs = appleRoot.map(n => readFileSync(n))

const appleVerificationUsage = async (transactionPayload: string): Promise<false|{plan: '001'|'002', hash: string}> => {
    const enableOnlineChecks = true
    const appAppleId = 6740261324 // appAppleId is required when the environment is Production

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
                        return true
                    }
               })
			}
		} while (response.hasMore)
	}
    return false
}

// appleReceipt(kk, kk1, kk2)
//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/payment_stripe

//	curl -v -X POST -H "Content-Type: application/json" -d '{"message": "{\"walletAddress\":\"0x31e95B9B1a7DE73e4C911F10ca9de21c969929ff\",\"solanaWallet\":\"CdBCKJB291Ucieg5XRpgu7JwaQGaFpiqBumdT6MwJNR8\",\"price\":299}","signMessage": "0xe8fd970a419449edf4f0f5fc0cf4adc7a7954317e05f2f53fa488ad5a05900667ec7575ad154db554cf316f43454fa73c1fdbfed15e91904b1cc9c7f89ea51841c"}' https://hooks.conet.network/api/applePayUser