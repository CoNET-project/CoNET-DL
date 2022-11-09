
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, getConfirmations } from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions} from 'node:http'
import { request } from 'node:https'
import Web3 from 'web3'
import { waterfall, series } from 'async'
import Color from 'colors/safe'

import { Client, auth, types, } from 'cassandra-driver'

const Eth = require('web3-eth')

const setup = join( homedir(),'master.json' )

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

export const CoNET_SI_Register = ( data: ICoNET_DecryptedPayload ) => {
	
	const cassClient = new Client (option)
	const payload = data.payload
	const time = new Date()

	return cassClient.connect ()
	.then (() => {
		return getIpaddressLocaltion (payload.ipV4)
	})
	.then ((_data: any) => {
		payload.ip_api = _data
		logger (`CoNET_SI_Register data\n${ inspect(_data, false, 3, true )}`)
		const cmd = `INSERT INTO conet_si_nodes ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, `+
					`public_key, nft_tokenid, online) VALUES (` +
					` '${ payload.wallet_CoNET }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon },`+
					`'${ data.publickey }', '${ createHash('sha256').update(payload.ipV4).digest('base64')}', dateof(now())`+
					`) `
		return cassClient.execute (cmd)
	}).then (() => {
		return cassClient.shutdown()
	}).catch (ex => {
		logger (`CoNET_SI_Register ERROR!`, ex )
		return cassClient.shutdown()
	})
}

export const getAllCoNET_SI_nodes = () => {
	return new Promise((resolve) => {
		const cassClient = new Client (option)
		return cassClient.connect ()
	})
}
const FaucetCount = 2
const FaucetTTL = 60 * 60 * 24
const fujiCONET = `https://conettech.ca/fujiCoNET`
const USDCNET = `http://mvpusdc.conettech.ca/mvpusdc`

const admin_public = masterSetup.master_wallet_public
const admin_private = masterSetup.master_wallet_private
const wei = 1000000000000000000

export const regiestFaucet = (wallet_addr: string ) => {
	
	return new Promise ( async resolve => {

		const cassClient = new Client (option)
		const time = new Date()

		await cassClient.connect ()
		const cmd = `SELECT expired from conet_faucet WHERE wallet_addr = '${wallet_addr}'`
		const result = await cassClient.execute (cmd)
		if ( result?.rowLength ) {
			const expiredss = result.rows[0].expired
			const expireds = result.rows
			let expired = false
			expireds.forEach ( n => {
				if ( n.expired === true ) {
					expired = true
				}
			})
			if ( expired ) {
				logger (`${wallet_addr} have data\n`)
				await cassClient.shutdown ()
				return resolve (false)
			}
			
		}

		const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
		const obj = {
			gas: 21000,
			to: wallet_addr,
			value: (FaucetCount * wei).toString()
		}
		const createTransaction = await eth.accounts.signTransaction( obj, admin_private )
		const receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
		const cmd1 = `INSERT INTO conet_faucet (wallet_addr, timestamp, total, transaction_hash) VALUES ('${wallet_addr.toUpperCase()}', '${time.toISOString()}', ${FaucetCount}, '${receipt.transactionHash.toUpperCase()}')`
		await cassClient.execute (cmd1)
		const cmd2 = `UPDATE conet_faucet USING TTL ${FaucetTTL} SET expired = true WHERE wallet_addr = '${wallet_addr.toUpperCase()}' and timestamp = '${time.toISOString()}'`
		await cassClient.execute (cmd2)
		await cassClient.shutdown ()
		return resolve (true)
	})
	
}



const storeCoNET_market = (price: number, oneDayPrice: number) => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		const time = new Date()
		const cmd = `INSERT INTO conet_market (date, price, value_24hours, token_id) VALUES ('${time.toISOString()}', ${ price }, ${ oneDayPrice }, 'AVAX')`
		await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve (null)
	})
}
const streamCoNET_USDCInterval = 3 * 60 * 1000

export const streamCoNET_USDCPrice = (quere: any[]) => {

	quere.shift ()
	const option:RequestOptions = {
		host: 'min-api.cryptocompare.com',
		method: 'GET',
		path: '/data/pricemultifull?fsyms=AVAX&tsyms=USD',
		headers: {
			'accept': 'application/json'
		},
		port: 443
	}

	const req = request (option, res => {
		let _data = ''
		res.on ('data', data => {
			_data += data.toString ()
		})

		res.once ('end', async () => {

			let response
			try {
				response = JSON.parse (_data)
			} catch (ex) {
				return logger (Color.red(`streamCoNET_USDCInterval JSON.parse Error`), _data)
			}
			
			await storeCoNET_market (response.RAW.AVAX.USD.PRICE, response.RAW.AVAX.USD.VOLUME24HOUR)
			logger (`streamCoNET_USDCInterval SUCCESS!, PRICE [${Color.green(response.RAW.AVAX.USD.PRICE)}] VOLUME24HOUR[${Color.green(response.RAW.AVAX.USD.VOLUME24HOUR)}]`)

		})
	})


	req.once ('error', err => {
		logger (Color.red(`streamCoNET_USDCPrice request Once Error`), err )
	})

	req.end (() => {
		if ( !quere.length ) {
			const kk = setTimeout (() => {
				streamCoNET_USDCPrice (quere)
			}, streamCoNET_USDCInterval)
			quere.unshift (kk)
		}
	})
	
	
}

export const getLast5Price = () => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		const cmd = `SELECT date, price, value_24hours from conet_market where token_id ='AVAX' order by date DESC LIMIT 5`
		const res = await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve(res.rows)
	})
}

const estimateGas = async (wallet_addr: string ) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
	const gas = await eth.estimateGas ({
		to: wallet_addr,
		from: admin_public,
		value: wei.toString()
	})
}

export const exchangeUSDC = (txHash: string) => {
	return new Promise ( async resolve => {
		const _res = await getConfirmations (txHash, admin_public)
		if (!_res) {
			logger (`getConfirmations have no data!`)
			return resolve(false)
		}
		const cassClient = new Client (option)
		const cmd2 = `SELECT from_transaction_hash from conet_usdc_exchange where from_addr = '${ _res.from.toUpperCase() }' and from_transaction_hash = '${ txHash.toUpperCase() }'`
		const rowLength = (await cassClient.execute (cmd2)).rowLength
		
		if ( rowLength > 0 ) {
			logger (`exchangeUSDC txHash[${ txHash }] already had data!`)
			await cassClient.shutdown ()
			return resolve(false)
		}

		const cmd = `SELECT price from conet_market where token_id ='AVAX' order by date DESC LIMIT 1`
		const rate = (await cassClient.execute (cmd)).rows[0].price
		const usdc = rate * _res.value

		const obj = {
			gas: 21000,
			to: _res.from,
			value: (usdc * wei).toString()
		}

		const eth = new Eth ( new Eth.providers.HttpProvider(USDCNET))
		const createTransaction = await eth.accounts.signTransaction( obj, admin_private )
		const receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
		const time = new Date()
		const cmd1 = `INSERT INTO conet_usdc_exchange (from_addr, timestamp, from_transaction_hash, rate, total_conet, total_usdc, transaction_hash) VALUES (` +
			`'${ _res.from.toUpperCase() }', '${time.toISOString()}', '${ txHash.toUpperCase() }', ${rate}, ${ _res.value }, ${ usdc }, '${receipt.transactionHash.toUpperCase()}')`
		await cassClient.execute (cmd1)
		await cassClient.shutdown ()
		return resolve(true)
	})
	
	


}


/****************************************************************************
 * 
 * 			TEST AREA
 * 
 ***************************************************************************/
/*

const testWallet = '0xc45543B3Ad238696a417b94483D313794541c4dF'

regiestFaucet (testWallet)
/*

initDatabase ( err => {
	if ( err ) {
		return logger ( err )
	}
	logger ('success')
})
/** */
/*
const ttt = async () => {
	const uuuu = await regiestFaucet ('0f044fcc79b761b3368fc05954abb4107c1c722a')
	console.log (uuuu)
}

ttt()
/** */

/*
const uu = {
	payload: {
		ipV4Port: 80,
		ipV4: '74.208.24.74',
		storage_price: 0.01,
		outbound_price: 0.00001,
		wallet_CoNET: '0f044fcc79b761b3368fc05954abb4107c1c722a',
		wallet_CNTCash: '67ca937c35f6d188dafddbd266824febc902a2dc',
		publicKey:'publicKey67ca937c35f6d188dafddbd266824febc902a2dc'
		
	},
	senderAddress: '0x0f044fcC79b761b3368Fc05954AbB4107c1c722a',
	publickey: ''
}
/** */
/*
const uu = async () => {
	const ret = await exchangeUSDC ('0x095e9da197a4582c1f08e7a062f416ebe8623e333262dd85d558ff2282fc8390')
	logger (`exchangeUSDC success`, ret)
}
uu()


/*
const uu = async () => {
	const uu: any = await getLast5Price ()
	uu.forEach ((n: any) => {
		logger (n.date, n.price, n.value_24hours)
	})
}
uu()
/*
const uu: any[] = []

streamCoNET_USDCPrice (uu)


//CoNET_SI_Register(uu)



/** */