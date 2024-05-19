
import { logger } from './logger'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import {conet_Referral_contractV2} from './util'
import {abi as CONET_Referral_ABI} from './conet-referral.json'
import {ConnectionConfig, createConnection} from 'mysql'

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
		const ret = results[0]
		
		return callbak(null, ret)
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
			logger(`getReferrer return err`, err)
			return callback (null)
		}
	
		logger(`getReferrer return no Err`, inspect(data, false, 3, true))
		if (data) {
			
			return callback ({ wallet: data.wallet, pay: (totalToken * reword).toFixed(0)})
		}

		const conet_Holesky_rpc = 'https://rpc.conet.network'
		const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
		let address
		try {
			address = await contract.getReferrer(wallet)
		} catch (ex) {
			logger(`contract.getReferrer Error!`, ex)
			return callback (null)
		}
		if (address === '0x0000000000000000000000000000000000000000') {
			return callback (null)
		}
		address = address.toLowerCase()
		await saveReferrer(wallet, address)
		return callback ({wallet: address, pay: (totalToken * reword).toFixed(0)})
	})
}

interface returnData {
	addressList: string[]
	payList: string[]
}

const constCalculateReferralsCallback = (addressList: string[], payList: string[], CallBack: (data: returnData|null) => void) => {
	return mySql.end(() => {
		if (addressList.length <1) {
			return CallBack (null)
		}
		return CallBack ({addressList, payList})
	})
}

const CalculateReferrals = (walletAddress: string, totalToken: number, CallBack: (data: returnData|null) => void) => {
	mySql.connect(err => {
		if (err) {
			logger(`CalculateReferrals mySql.connect Error try again!`, err)
			return setTimeout(() => {
				return CalculateReferrals (walletAddress, totalToken, CallBack)
			}, 500)
			
		}
		let _walletAddress = walletAddress.toLowerCase()
	
		const addressList: string[] = []
		const payList: string[] = []

		return countReword(.05, _walletAddress, totalToken, data1 => {
			if (!data1) {
				logger(`countReword(0.5) return null data`)
				return constCalculateReferralsCallback(addressList, payList, CallBack)
			}
			logger(`countReword(0.5) return data [${inspect(data1, false, 3, true)}]`)
			addressList.push(data1.wallet)
			payList.push(data1.pay)

			return countReword(.03, data1.wallet, totalToken, data2 => {
				if (!data2) {
					logger(`countReword(0.3) return null data!`)
					return constCalculateReferralsCallback(addressList, payList, CallBack)
				}
				addressList.push(data2.wallet)
				payList.push(data2.pay)
				logger(`countReword(0.3) return data [${inspect(data2, false, 3, true)}]`)
				return countReword(.01, data2.wallet, totalToken, data3 => {
					if (!data3) {
						return constCalculateReferralsCallback(addressList, payList, CallBack)
					}
					addressList.push(data3.wallet)
					payList.push(data3.pay)
					logger(`countReword(0.1) return data [${inspect(data3, false, 3, true)}]`)
					return constCalculateReferralsCallback(addressList, payList, CallBack)
				})
			})
		})

	})
	
}



let wallet = ''
let rate = 0
const [,,...args] = process.argv
args.forEach ((n, index ) => {

	if (/\wallet/i.test(n)) {
		wallet = n.split('=')[1]
	} else if (/\rate/.test(n)) {
		rate = parseFloat(n.split('=')[1])
	}
})
if (wallet && rate ) {
	CalculateReferrals(wallet, rate, (data)=> {
		console.log (JSON.stringify(data))
	})
}

