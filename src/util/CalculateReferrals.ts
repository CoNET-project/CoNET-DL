import {ConnectionConfig, createConnection} from 'mysql'
import { logger } from './logger'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import {conet_Referral_contractV2} from './util'
import {abi as CONET_Referral_ABI} from './conet-referral.json'


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
	return mySql.query(query, (err, results, fields) => {
		if (err) {
			return callbak (err)
		}
		logger(`getReferrer results!`)
		logger(inspect(results[0], false, 3, true))
		return callbak(null, results)
	})
}

const saveReferrer = (id: string, address: string) => new Promise( resolve => {
	const query = `INSERT INTO referrer (id, wallet) VALUES ('${id}', '${address}')`
	return mySql.query(query, (err, results, fields) => {
		return resolve(true)
	})
})


const countReword = (reword: number, wallet: string, totalToken: number, callback: (data: null|{wallet: string,pay: string}) => void) => {
	return getReferrer(wallet, async (err, data: any) => {
		if (err) {
			return callback (null)
		}
		if (data) {
			return ({wallet: data.RowDataPacket.wallet, pay: (totalToken * reword).toFixed(0)})
		}
		const conet_Holesky_rpc = 'https://rpc.conet.network'
		const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
		let address
		try {
			address = (await contract.getReferrer(wallet)).toLowerCase()
		} catch (ex) {

		}
		if (address === '0x0000000000000000000000000000000000000000') {
			return callback (null)
		}
		
		await saveReferrer(wallet, address)
		return ({wallet: address, pay: (totalToken * reword).toFixed(0)})
	})
}

const constCalculateReferralsCallback = (addressList: string[], payList: string[], CallBack: (data?: any) => void) => {
	return mySql.end(() => {
		if (addressList.length <1) {
			return CallBack (null)
		}
		return CallBack ({addressList, payList})
	})
}

const CalculateReferrals = (walletAddress: string, totalToken: number, CallBack: (data?: any) => void) => {
	return mySql.connect(err => {
		if (err) {
			return setTimeout(() => {
				return CalculateReferrals (walletAddress, totalToken, CallBack)
			}, 500)
			
		}
		let _walletAddress = walletAddress.toLowerCase()
	
		const addressList: string[] = []
		const payList: string[] = []

		return countReword(.05, _walletAddress, totalToken, data1 => {
			if (!data1) {
				return constCalculateReferralsCallback(addressList, payList, CallBack)
			}
			addressList.push(data1.wallet)
			payList.push(data1.pay)
			return countReword(.03, data1.wallet, totalToken, data2 => {
				if (!data2) {
					return constCalculateReferralsCallback(addressList, payList, CallBack)
				}
				addressList.push(data2.wallet)
				payList.push(data2.pay)
				return countReword(.01, data2.wallet, totalToken, data3 => {
					if (!data3) {
						return constCalculateReferralsCallback(addressList, payList, CallBack)
					}
					addressList.push(data3.wallet)
					payList.push(data3.pay)
					return constCalculateReferralsCallback(addressList, payList, CallBack)
				})
			})
		})

	})
	
}
mySql.connect(err => {
	if (err) {
		return logger(err)
	}
	return CalculateReferrals('0x8c96953df8ddf2ff9141be66d196c8bf69800e39', 16928327600000000, ( data)=> {
		mySql.end(() => {
			logger (`mySql.end!`)
			logger(inspect(data, false, 3, true))
		})
		
	})
})
