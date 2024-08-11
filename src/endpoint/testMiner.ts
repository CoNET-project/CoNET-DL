
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
import EthCrypto from 'eth-crypto'
import Colors from 'colors/safe'
import type {RequestOptions} from 'node:http'
import {request as requestHttps} from 'node:https'

const api_endpoint = 'https://api.conet.network/api/'

const getWallet = (SRP: string, max: number, __start: number) => {
	const acc = ethers.Wallet.fromPhrase(SRP)
	const wallets: string[] = []
	wallets.push (acc.signingKey.privateKey)
	for (let i = __start; i < max; i ++) {
		const sub = acc.deriveChild(i)
		wallets.push (sub.signingKey.privateKey)
	}
	logger(inspect(wallets, false, 3, true))
	let i = 0
	mapLimit(wallets, 1, async (n, next) => {
		i++
		logger (`start connect ${i}`)
		await start(n)
		
	})

}

const start = (privateKeyArmor: string) => new Promise(async resolve => {
	const wallet = new ethers.Wallet(privateKeyArmor)
	const message  = JSON.stringify({walletAddress: wallet.address.toLowerCase()})
	const messageHash =  ethers.id(message)
	const signMessage = EthCrypto.sign(privateKeyArmor, messageHash)
	const sendData = {
		message, signMessage
	}

	const url = `${ api_endpoint }startMining`

	logger(Colors.green(`Start a miner! [${wallet.address}]`))

	startTestMiner(url, JSON.stringify(sendData), (err, data) => {
		setTimeout(() => {
			resolve (true)
		},4000)

		if (err) {
			return logger(Colors.red(err))
		}
		
	})

})
const startTestMiner = (url: string, POST: string,  callback: (err?: string, data?: string) => void) => {
	const Url = new URL(url)
	const option: RequestOptions = {
		hostname: Url.hostname,
		port: 443,
		method: 'POST',
		protocol: 'https:',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8'
		},
		path: Url.pathname
	}
	let first = true
	const kkk = requestHttps(option, res => {

		if (res.statusCode !==200) {
			setTimeout(() => {
				startTestMiner (url, POST, callback)
			}, 1000)
			
			return logger(`startTestMiner got res.statusCode = [${res.statusCode}] != 200 error! restart`)
		}

		let data = ''
		let _Time: NodeJS.Timeout
		res.on ('data', _data => {
			data += _data.toString()
			if (/\r\n\r\n/.test(data)) {
				clearTimeout(_Time)
				if (first) {
					first = false
					callback ('', data)
				}
				
				_Time = setTimeout(() => {
					return startTestMiner (url, POST, callback)
				}, 24 * 1000)
			}
		})
		
	})

	kkk.on('error', err => {
		return startTestMiner (url, POST, callback)
	})

	kkk.once('end', () => {
		return startTestMiner (url, POST, callback)
	})

	kkk.end(POST)

}



const [,,...args] = process.argv
let _SRP = ''
let number = 1
let _start = 0
args.forEach ((n, index ) => {

	if (/^P\=/i.test(n)) {
		const srp = n.split('=')[1]
		_SRP = srp
	}
	if (/^N\=/i.test(n)) {
		number = parseInt(n.split('=')[1])
	}

	if (/^S\=/i.test(n)) {
		_start = parseInt(n.split('=')[1])
	}
})

if ( _SRP && number > 0) {
	getWallet (_SRP, number, _start)
}