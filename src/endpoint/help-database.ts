
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, getConfirmations, checkPublickeySign, decryptPayload, postRouterToPublic, regiestCloudFlare } from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions} from 'node:http'
import { request } from 'node:https'
import {v4} from 'uuid'
import {encryptWithPublicKey, createIdentity, hash, decryptWithPrivateKey, recover } from 'eth-crypto'
const Eth = require('web3-eth')
import Color from 'colors/safe'

import { Client, auth, types } from 'cassandra-driver'


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

const CoNET_SI_healthy_TTL = 1 * 60 * 5

export const CoNET_SI_Register = ( data: ICoNET_DecryptedPayload, s3pass: s3pass ) => {

	return new Promise(async resolve => {
		const cassClient = new Client (option)
		const payload: ICoNET_DL_POST_register_SI = data.payload


		const time = new Date()
		
		payload.ip_api = await getIpaddressLocaltion (payload.ipV4)

		if ( !payload.ip_api || !payload.pgpPublicKey ) {
			return resolve (false)
		}

		const pgpKey = await checkPublickeySign (payload.pgpPublicKey)

		if (!/^0[xX]/.test(payload.wallet_CoNET)) {
			payload.wallet_CoNET = '0X' + payload.wallet_CoNET
		}
		if ( !pgpKey || data.senderAddress !== payload.wallet_CoNET.toUpperCase()) {

			logger (Color.red(`CoNET_SI_Register !pgpKey || data.publickey.toUpperCase() !== payload.wallet_CoNET.toUpperCase() ERROR`), inspect(data, false, 3, true ))
			return resolve (false)
		}

		const nft_tokenid = createHash('sha256').update(payload.ipV4).digest('base64')
		const customs_review_total = (Math.random()*5).toFixed(2)

		logger (`CoNET_SI_Register data\n${ inspect( payload, false, 3, true )}`)
		const cmd = `INSERT INTO conet_si_nodes ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
					` '${ data.senderAddress }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${ customs_review_total }, `+
					`'${ pgpKey.publicKeyID }', '${ nft_tokenid }', 5, dateof(now())`+ `) `

		const cmd2 = `INSERT INTO conet_si_nodes_online ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
					` '${ data.senderAddress }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${customs_review_total}, ` +
					`'${ pgpKey.publicKeyID }', '${ nft_tokenid }', 5, dateof(now())`+ `) USING TTL ${ CoNET_SI_healthy_TTL } `
		const cmd3 = `INSERT INTO conet_si_nodes_customs_review ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
					` '${ data.senderAddress }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${ customs_review_total }, ` +
					`'${ pgpKey.publicKeyID }', '${ nft_tokenid }', 5, dateof(now())`+ `) USING TTL ${ CoNET_SI_healthy_TTL } `
		await cassClient.connect ()
		await cassClient.execute (cmd)
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)
		await cassClient.shutdown()
		await postRouterToPublic (data, pgpKey, s3pass)
		await regiestCloudFlare (payload.ipV4, pgpKey.publicKeyID, masterSetup )
		return resolve (nft_tokenid)
	})
}

export const CoNET_SI_health = ( message: string, signature: string ) => {

	return new Promise( async resolve => {

		const yyy = decryptPayload( message, signature )

		if ( !yyy||! yyy.payload?.nft_tokenid) {
			logger (`CoNET_SI_health ERROR!, encryptedString have no nft_tokenid! payload = [${ inspect( yyy, false, 3, true ) }]`)
			return resolve (false)
		}

		const cassClient = new Client (option)
		const nft_tokenid = yyy.payload.nft_tokenid

		const cmd = `Select * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }'`
		const res = await cassClient.execute (cmd)
		const oldData = res.rows[0]

		if ( !res.rowLength || oldData.pgp_publickey_id !== yyy.payload.publickey.toUpperCase()) {
			await cassClient.shutdown ()
			logger (`CoNET_SI_health ERROR!, SI have no nft_tokenid or wrong pgp_publickey_id. payload = [${ inspect( yyy.payload, false, 3, true ) }] DB = [${ inspect(oldData, false, 3, true) }]` )
			return resolve (false)
		}

		
		const customs_review_total = (Math.random()*5).toFixed(2)

		const cmd1 = `UPDATE conet_si_nodes SET customs_review_total = ${ customs_review_total }, total_online = ${oldData.total_online} + 5, last_online = dateof(now()) Where country = '${oldData.country}' and nft_tokenid = '${oldData.nft_tokenid}'`
		await cassClient.execute (cmd1)

		const cmd2 = `INSERT INTO conet_si_nodes_online ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
			`country, region, lat, lon, customs_review_total, `+
			`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
			` '${ oldData.wallet_addr }', '${ oldData.ip_addr }', ${ oldData.outbound_fee }, ${ oldData.storage_fee }, '${ oldData.registration_date }', `+
			`'${ oldData.country }', '${ oldData.region }', ${ oldData.lat }, ${ oldData.lon }, ${customs_review_total}, ` +
			`'${ oldData.pgp_publickey_id }', '${ nft_tokenid }', ${oldData.total_online + 5}, dateof(now())`+ `) USING TTL ${CoNET_SI_healthy_TTL} `

		const cmd3 = `INSERT INTO conet_si_nodes_customs_review ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
			`country, region, lat, lon, customs_review_total, `+
			`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
			` '${ oldData.wallet_addr }', '${ oldData.ip_addr }', ${ oldData.outbound_fee }, ${ oldData.storage_fee }, '${ oldData.registration_date }', `+
			`'${ oldData.country }', '${ oldData.region }', ${ oldData.lat }, ${ oldData.lon }, ${customs_review_total}, ` +
			`'${ oldData.pgp_publickey_id }', '${ nft_tokenid }', ${oldData.total_online + 5}, dateof(now())`+ `) USING TTL ${CoNET_SI_healthy_TTL} `

			
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)
		await cassClient.shutdown ()
		logger (`CoNET_SI_health SUCCESS!`)
		return resolve (true)
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
const USDCNET = `https://mvpusdc.conettech.ca/mvpusdc`

const admin_public = masterSetup.master_wallet_public
const admin_private = masterSetup.master_wallet_private
const wei = 1000000000000000000

export const regiestFaucet = (wallet_addr: string, ipAddr: string ) => {
	
	return new Promise ( async resolve => {

		const cassClient = new Client (option)
		const time = new Date()

		await cassClient.connect ()
		let cmd = `SELECT * from conet_faucet_ipaddress WHERE client_ipaddress = '${ipAddr}'`

		let result = await cassClient.execute (cmd)

		logger (inspect(result, false, 3, true))

		if ( result?.rowLength > 9 ) {
			logger (Color.red(`regiestFaucet IP address [${ ipAddr }] over 10 in 24 hours! STOP!`))
			await cassClient.shutdown ()
			return resolve (false)
		}

		wallet_addr = wallet_addr.toUpperCase()
		cmd = `SELECT * from conet_faucet_wallet_addr WHERE wallet_addr = '${ wallet_addr }'`
		result = await cassClient.execute (cmd)
		
		if ( result?.rowLength > 0 ) {
			logger (Color.red(`regiestFaucet IP address [${ ipAddr }] Wallet Address [${ wallet_addr }] already did Faucet in 24 hours! STOP! `))
			await cassClient.shutdown ()
			return resolve (false)
		}

		const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))

		const _nonce = await eth.getTransactionCount(admin_public)
		logger (_nonce)
		const nonce = '0x' + ((_nonce) + 1).toString(16)
		const obj = {
			gas: 21000,
			to: wallet_addr,
			value: (FaucetCount * wei).toString()
		}

		const createTransaction = await eth.accounts.signTransaction( obj, admin_private )

		let receipt
		try {
			receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
		} catch (ex) {
			logger (`eth.sendSignedTransaction ERROR!`, ex)
			await cassClient.shutdown ()
			return resolve (false)
		}

		logger (inspect(receipt, false, 3, true))

		const cmd2 = `INSERT INTO conet_faucet_ipaddress (client_ipaddress, timestamp) VALUES ('${ipAddr}', '${time.toISOString() }') USING TTL ${FaucetTTL}`
		const cmd3 = `INSERT INTO conet_faucet_wallet_addr (wallet_addr) VALUES ('${wallet_addr}') USING TTL ${FaucetTTL}`
		const cmd1 = `INSERT INTO conet_faucet (wallet_addr, timestamp, total, transaction_hash, client_ipaddress) VALUES ('${wallet_addr}', '${time.toISOString()}', ${ FaucetCount }, '${receipt.transactionHash.toUpperCase()}', '${ ipAddr }')`
		await cassClient.execute (cmd1)
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)

		logger (Color.blue(`regiestFaucet [${wallet_addr}:${ipAddr}] SUCCESS`))
		await cassClient.shutdown ()
		return resolve (receipt.transactionHash)
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
			//logger (`streamCoNET_USDCInterval SUCCESS!, PRICE [${Color.green(response.RAW.AVAX.USD.PRICE)}] VOLUME24HOUR[${Color.green(response.RAW.AVAX.USD.VOLUME24HOUR)}]`)

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
		const _res = await getConfirmations (txHash, admin_public, fujiCONET)
		if (!_res) {
			logger (`getConfirmations have no data!`)
			return resolve(false)
		}
		logger (inspect(_res, false, 3, true ))
		const cassClient = new Client (option)
		const cmd2 = `SELECT from_transaction_hash from conet_usdc_exchange where from_addr = '${ _res.from.toUpperCase() }' and from_transaction_hash = '${ txHash.toUpperCase() }'`
		const rowLength = await cassClient.execute (cmd2)
		
		if ( rowLength.rowLength > 0 ) {
			logger (`exchangeUSDC txHash[${ txHash }] already had data!`)
			await cassClient.shutdown ()
			return resolve(false)
		}
		logger (inspect(rowLength, false, 3, true))
		const cmd = `SELECT price from conet_market where token_id ='AVAX' order by date DESC LIMIT 1`
		const rate = (await cassClient.execute (cmd)).rows[0].price
		const usdc = rate * _res.value

		const obj = {
			gas: 21000,
			to: _res.from,
			value: (usdc * wei).toString()
		}
		const eth = new Eth ( new Eth.providers.HttpProvider(USDCNET))
		const time = new Date()
		let createTransaction
		try {
			createTransaction = await eth.accounts.signTransaction( obj, admin_private )
		} catch (ex) {
			logger (`exchangeUSDC eth.sendSignedTransaction ERROR`, ex )
			return resolve(false)
		}
		const receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
		const cmd1 = `INSERT INTO conet_usdc_exchange (from_addr, timestamp, from_transaction_hash, rate, total_conet, total_usdc, transaction_hash) VALUES (` +
			`'${ _res.from.toUpperCase() }', '${time.toISOString()}', '${ txHash.toUpperCase() }', ${rate}, ${ _res.value }, ${ usdc }, '${receipt.transactionHash.toUpperCase()}')`
		await cassClient.execute (cmd1)
		await cassClient.shutdown ()
		return resolve(receipt.transactionHash)
	})
	
	


}
const asset_name = 'USDC'

export const mint_conetcash = async (txHash: string, sign: string ) => {
	if (!txHash || !sign) {
		logger (`mint_conetcash Error: !txHash || !sign`)
		return false
	}

	const usdcData = await getConfirmations(txHash, admin_public, USDCNET)
	if ( !usdcData || usdcData.value <= 0 || usdcData.value > 100 ) {
		logger (`mint_conetcash have no usdcData or usdcData.value have not in []`, inspect(usdcData, false, 3, true))
		return false
	}
	const cassClient = new Client (option)
	const cmd1 = `SELECT from_transaction_hash from conet_dl_conetcash where asset_name = '${ asset_name }' and from_transaction_hash = '${ txHash.toUpperCase()  }'`
	const rowLength = (await cassClient.execute (cmd1)).rowLength
	if (rowLength > 0) {
		await cassClient.shutdown ()
		logger (`mint_conetcash ERROR: had same txHash [${ txHash.toUpperCase() }]`)
		return false
	}

	const message = hash.keccak256('0xD493391c2a2AafEd135A9f6164C0Dcfa9C68F1ee')
	const keyID: string = recover(sign, message)
	const time = new Date()
	const fee = usdcData.value * 0.0001
	const balance = usdcData.value - fee
	const id = v4().toUpperCase()
	const cmd2 = `INSERT INTO conet_dl_conetcash (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
		`'${keyID.toUpperCase()}', '${asset_name}', '${ txHash.toUpperCase() }', '${time.toISOString()}', ${usdcData.value}, ${balance}, '${id}', ${fee}, 0)`
	await cassClient.execute (cmd2)
	const cmd3 = `INSERT INTO conet_dl_conetcash_dl_id (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
		`'${keyID.toUpperCase()}', '${asset_name}', '${ txHash.toUpperCase() }', '${time.toISOString()}', ${usdcData.value}, ${balance}, '${id}', ${fee}, 0)`
	await cassClient.execute (cmd3)
	await cassClient.shutdown ()
	return id
}

export const conetcash_getBalance = (id: string ) => {
	return new Promise( async resolve => {
		const cmd1 = `SELECT * from conet_dl_conetcash_dl_id where asset_name='${asset_name}' and dl_id='${id.toUpperCase()}'`
		const cassClient = new Client (option)
		const data =  (await cassClient.execute (cmd1)).rows[0]
		await cassClient.shutdown ()
		if (!data) {
			return resolve({})
		}
		const ret = {
			id: data.dl_id,
			balance: data.balance,
			owner: data.owner_addr
		}
		return resolve(ret)
	})
}

export const getSI_nodes = (sortby: SINodesSortby, region: SINodesRegion ) => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		
		const cmd1 = `SELECT COUNT(*) FROM conet_si_nodes`
		const cmd = `SELECT * from conet_si_nodes_customs_review LIMIT 10`
		let total
		let data
		try {
			total = (await cassClient.execute (cmd1)).rows[0]
			data = await cassClient.execute (cmd)
		} catch (ex) {
			return resolve (null)
		}
		
		return resolve ({total: total, rows: data.rows })
	})
}
