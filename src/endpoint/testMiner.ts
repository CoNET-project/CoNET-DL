import {start} from './util'
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
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