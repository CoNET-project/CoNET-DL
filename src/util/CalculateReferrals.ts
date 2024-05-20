
import {inspect} from 'node:util'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'

const getReferrer = async (address: string, callbak: (err: Error|null, data?: any) => void)=> {
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/wallet`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		wallet: address
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak (null, ret)
			} catch (ex: any) {
				console.error(`getReferrer JSON.parse(data) Error!`, data)
				return callbak (ex)
			}
			
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (e)
	})

	req.write(JSON.stringify(postData))
	req.end()
}


const countReword = (reword: number, wallet: string, totalToken: number, callback: (data: null|{wallet: string,pay: string}) => void) => {
	return getReferrer(wallet, async (err, data: any) => {
		if (err) {
			console.error(`getReferrer return err`, err)
			return callback (null)
		}
		console.error(`getReferrer return ${inspect(data, false, 3, true)}`)
		if (data?.address !== '0x0000000000000000000000000000000000000000') {
			return callback ({ wallet: data.address, pay: (totalToken * reword).toFixed(0)})
		}
		return callback (null)
	})
}

interface returnData {
	addressList: string[]
	payList: string[]
}

const constCalculateReferralsCallback = (addressList: string[], payList: string[], CallBack: (data: returnData|null) => void) => {
	
	if (addressList.length <1) {
		return CallBack (null)
	}
	return CallBack ({addressList, payList})
	
}

const CalculateReferrals = (walletAddress: string, totalToken: number, CallBack: (data: returnData|null) => void) => {
	
		let _walletAddress = walletAddress.toLowerCase()
	
		const addressList: string[] = []
		const payList: string[] = []

		return countReword(.05, _walletAddress, totalToken, data1 => {
			if (!data1) {
				console.debug(`countReword(0.5) return null data`)
				return constCalculateReferralsCallback(addressList, payList, CallBack)
			}
			console.error(`countReword(0.5) return data [${inspect(data1, false, 3, true)}]`)
			addressList.push(data1.wallet)
			payList.push(data1.pay)

			return countReword(.03, data1.wallet, totalToken, data2 => {
				if (!data2) {
					console.error(`countReword(0.3) return null data!`)
					return constCalculateReferralsCallback(addressList, payList, CallBack)
				}
				addressList.push(data2.wallet)
				payList.push(data2.pay)
				console.error(`countReword(0.3) return data [${inspect(data2, false, 3, true)}]`)
				return countReword(.01, data2.wallet, totalToken, data3 => {
					if (!data3) {
						return constCalculateReferralsCallback(addressList, payList, CallBack)
					}
					addressList.push(data3.wallet)
					payList.push(data3.pay)
					console.error(`countReword(0.1) return data [${inspect(data3, false, 3, true)}]`)
					return constCalculateReferralsCallback(addressList, payList, CallBack)
				})
			})
		})

}



let wallet = ''
let rate = 0.0
const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/^wallet\=/i.test(n)) {
		wallet = n.split('=')[1]
	}
	if (/^rate\=/i.test(n)) {
		const kk = n.split('=')[1]
		rate = parseFloat(kk)
	}
})

if (wallet && rate > 0 ) {
	CalculateReferrals(wallet, rate, (data)=> {
		console.log (`ret=${JSON.stringify(data)}`)
	})
} else {
	console.error(`wallet ${wallet} rate ${rate} Error!`)
}

