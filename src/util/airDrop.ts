import { transferCCNTP} from './transferManager'
import {readFile} from 'node:fs'
import { logger } from './logger'
import {ethers} from 'ethers'
import {masterSetup} from './util'
import { inspect } from 'node:util'


const start = async (fileName: string) => {
	return readFile(fileName, (err, data) => {
		if (err) {
			return logger(err)
		}
		const _wallets: string[] = data.toString().split('\n')
		const wallets: string[] = []
		logger(JSON.stringify(_wallets))
		_wallets.forEach(n => {
			const rr = ethers.getAddress(n)
			if (!rr) {
				return logger(`Error Wallet => ${n}`)
			}
			wallets.push(rr)
		})
		const pay = wallets.map(n => '200')
		transferCCNTP(masterSetup.conetCNTPAdmin[5], wallets, pay, err => {
			if (err) {
				return logger(err)
			}
			logger(`success!`)
		})
	})
}
const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/^f\=/i.test(n)) {
		const filename = n.split('=')[1]
		start(filename)
	}
})
