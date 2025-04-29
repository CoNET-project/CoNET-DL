import { logger } from "../util/util"
import {inspect} from 'node:util'
import { Client, auth, types, } from 'cassandra-driver'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import type { TLSSocketOptions } from 'node:tls'
import Color from 'colors/safe'

const bnbTime = 5 * 60 * 1000
const asset_rate_binance_url = 'https://api.binance.com/api/v3/avgPrice?symbol='

const setup = join( homedir(),'.master.json' )

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const sslOptions: TLSSocketOptions = {
	key : masterSetup.Cassandra.certificate.key,
	cert : masterSetup.Cassandra.certificate.cert,
	ca : masterSetup.Cassandra.certificate.ca,
	rejectUnauthorized: masterSetup.Cassandra.certificate.rejectUnauthorized
}

const option = {
	contactPoints : masterSetup.Cassandra.databaseEndPoints,
	localDataCenter: 'dc1',
	authProvider: new auth.PlainTextAuthProvider ( masterSetup.Cassandra.auth.username, masterSetup.Cassandra.auth.password ),
	sslOptions: sslOptions,
	keyspace: masterSetup.Cassandra.keyspace,
	protocolOptions: { maxVersion: types.protocolVersion.v4 }
}

export const daemons = () => {
	logger (`daemons running!`)
	getAssetRateLoop()
}

const storageOraclePrice = async (data: bnbAvgPrice, currency_name: string) => new Promise(async resolve => {
	const cassClient = new Client (option)
	const cmd = `INSERT INTO conet_crypto_price (timestamp, currency_name, usd_price) VALUES ('${data.closeTime}', '${currency_name}', '${data.price}')`
	try {
		await cassClient.execute (cmd)
	} catch (ex: any) {
		await cassClient.shutdown()
		logger (Color.red(`storageOraclePrice execute ${cmd} Error!`), ex)
		return resolve(false)
	}
	await cassClient.shutdown()
	return resolve (true)
})



const getBNBAvgPrice: (url: string)=>Promise<boolean|bnbAvgPrice> = (url: string) => new Promise( resolve => 
	fetch(url, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8',
			'Connection': 'close',
		},
		cache: 'no-store',
		referrerPolicy: 'no-referrer'
	}).then ( async res => {
		if (res.status!== 200) {
			const err = `getPrice [${url}] response not 200 [${res.status}] Error! try again!`
			logger(err)
			return resolve (false)
		}
		return res.json()
	}).then((data) => resolve(data))
	.catch (ex=> {
		logger(ex.message)
		return resolve(false)
	})

)
let tryETHCount = 5
let tryBNBCount = 5

const getAssetRateLoop = async () => {
	
	const ethRate_url = asset_rate_binance_url + 'ETHUSDT'
	const bnbhRate_url = asset_rate_binance_url + 'BNBUSDT'
	const doProcessEth = async () => {
		if (--tryETHCount < 0) {
			return logger(`getAssetRate tryCount < 0 giveup trying!`)
		}
		const ethPrice = await getBNBAvgPrice(ethRate_url)
		if (typeof ethPrice === 'boolean') {
			return setTimeout (async () => {
				await doProcessEth ()
			}, 10000)
		}
		tryETHCount = 5

		const nextUpdate = ethPrice.closeTime + bnbTime - new Date().getTime()
		logger(`doProcessEth process next [${nextUpdate}] timeup = ${new Date( ethPrice.mins + bnbTime)} ${inspect(ethPrice, false, 3, true)}`)
		await storageOraclePrice (ethPrice, 'eth')
		return setTimeout(async () => {
			doProcessEth()
		}, nextUpdate)
	}

	const doProcessBNB = async () => {
		if (--tryBNBCount < 0) {
			return logger(`doProcessBNB tryCount < 0 giveup trying!`)
		}
		const ethPrice = await getBNBAvgPrice(bnbhRate_url)
		if (typeof ethPrice === 'boolean') {
			return setTimeout (async () => {
				await doProcessEth ()
			}, 10000)
		}
		tryBNBCount = 5
		await storageOraclePrice (ethPrice, 'bnb')
		const nextUpdate = ethPrice.closeTime + bnbTime - new Date().getTime()
		logger(`doProcessBNB process next [${nextUpdate}] timeup = ${new Date( ethPrice.mins + bnbTime)} ${inspect(ethPrice, false, 3, true)}`)
		return await setTimeout(async () => {
			doProcessBNB()
		}, nextUpdate)
	}
	await doProcessEth()
	await doProcessBNB()
}