import {start} from './util'
import {ethers} from 'ethers'
import { logger } from '../util/logger'
import {inspect} from 'node:util'

const getWallet = (SRP: string, max: number) => {
	const acc = ethers.Wallet.fromPhrase(SRP)
	const wallets: string[] = []
	wallets.push (acc.signingKey.privateKey)
	for (let i = 0; i < max; i ++) {
		const sub = acc.deriveChild(i)
		wallets.push (sub.signingKey.privateKey)
	}
	logger(inspect(wallets, false, 3, true))
	wallets.forEach(n => {
		start(n)
	})

}

const [,,...args] = process.argv
let _SRP = ''
let number = 0
args.forEach ((n, index ) => {

	if (/^P\=/i.test(n)) {
		const srp = n.split('=')[1]
		_SRP = srp
	}
	if (/^N\=/i.test(n)) {
		number = parseInt(n.split('=')[1])
	}
})

if ( _SRP && number > 0) {
	getWallet (_SRP, number)
}