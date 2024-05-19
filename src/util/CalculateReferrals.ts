import {ConnectionConfig, createConnection} from 'mysql'
import { logger } from './logger'
import {inspect} from 'node:util'

const connectObj:ConnectionConfig = {
	host     : 'localhost',
	user     : 'conet',
	password : 'DTx2BNX/yb5sr5K/GYg=',
	database : 'conet'
}
const mySql = createConnection (connectObj)

const getReferrer = (address: string, callbak: (err: Error|null, data?: any) => void)=> {
	const _address = address.toLowerCase()
	const query = `SELECT wallet FROM referrer WHERE id = '${_address}'`
	mySql.query(query, (err, results, fields) => {
		if (err) {
			return callbak (err)
		}
		logger(`getReferrer results!`)
		logger(inspect(results, false, 3, true))
		callbak(null, results)
	})
}

const saveReferrer = (id: string, address: string) => {
	const _address = address.toLowerCase()
	const _id = id.toLowerCase()
	const query = `INSERT INTO referrer (id, wallet) VALUES ('${_id}', '${_address}')`

}

const countReword = (reword: number, wallet: string, totalToken: number,  callback: (data: null|string)=> void) => {
	return getReferrer(wallet, (err, data) => {
		if (err) {
			return callback (null)
		}
		// if (!data) {
		// 	const wallet1 = await contract.getReferrer(wallet)
		// }
		// return callback((totalToken * reword).toString())
	})
}

const CalculateReferrals = (walletAddress: string, totalToken: string, rewordArray: number[], CallBack: (err:Error|null, data?: any) => void) => {
	return mySql.connect(err => {
		if (err) {
			return setTimeout(() => {
				return CalculateReferrals (walletAddress, totalToken, rewordArray, CallBack)
			}, 500)
			
		}
		let _walletAddress = walletAddress.toLowerCase()
	
		const addressList: string[] = []
		const payList: string[] = []

		for (let i of [.05, .03, .01]) {
			let address: string
			// countReword(i, _walletAddress, data => {

			// })
			// try{
			// 	address = ReferralsMap.get(_walletAddress) || await contract.getReferrer(_walletAddress)
			// } catch (ex: any) {
			// 	break
			// }
			
			// // logger (colors.blue(`CalculateReferrals get address = [${address}]`))
			// if (address === '0x0000000000000000000000000000000000000000') {
			// 	break
			// }

			
			// address = address.toLowerCase()
			// ReferralsMap.set(_walletAddress, address)
			// if (checkAddressArray.length) {
			// 	const index = checkAddressArray.findIndex(n => n.toLowerCase() === address)
			// 	if (index< 0) {
			// 		return CallBack(new Error(`CalculateReferrals walletAddress [${_walletAddress}'s up layer address ${address}] hasn't in checkAddressArray! STOP CalculateReferrals`))
			// 	}
			// }
			// addressList.push(address)
			// payList.push((parseFloat(totalToken)*i).toString())
			// _walletAddress = address
		}

		return CallBack(null, {addressList, payList})

	})
	
}

getReferrer('0x8c96953df8ddf2ff9141be66d196c8bf69800e39', (err, data)=> {
	if (err) {
		return logger (err)
	}
	logger(inspect(data, false, 3, true))
})