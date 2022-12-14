
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, getConfirmations, decryptPayload, postRouterToPublic, regiestCloudFlare, decryptPgpMessage } from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions} from 'node:http'
import { request } from 'node:https'
import {v4} from 'uuid'
import {encryptWithPublicKey, createIdentity, hash, decryptWithPrivateKey, recover } from 'eth-crypto'
import type { GenerateKeyOptions, Key, PrivateKey, Message, MaybeStream, Data, DecryptMessageResult, WebStream, NodeStream } from 'openpgp'

const Eth = require('web3-eth')
import Color from 'colors/safe'

import { Client, auth, types } from 'cassandra-driver'

const setup = join( homedir(),'.master.json' )

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const FaucetCount = 2
const FaucetTTL = 60 * 60 * 24
const fujiCONET = `https://conettech.ca/fujiCoNET`
const USDCNET = `https://mvpusdc.conettech.ca/mvpusdc`

const admin_public = masterSetup.master_wallet_public
const admin_private = masterSetup.master_wallet_private
const wei = 1000000000000000000
const si_last_Update_time_timeout = 1000 * 60 *5
const CoNETCashFee = 0.0001
const CoNET_SI_healthy_TTL = 1 * 60 * 5
const streamCoNET_USDCInterval = 3 * 60 * 1000
const asset_name = 'USDC'

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

const checkPayloadWalletSign = (payload: ICoNET_DL_POST_register_SI) => {

	let signAddr = ''
	let _txObjHash = ''

	try {
		_txObjHash = hash.keccak256(payload.walletAddr)
		signAddr = recover( payload.walletAddrSign , _txObjHash).toUpperCase()
	} catch (ex) {
		logger (Color.red(`checkPayloadWalletSign recover Error`), ex)
		return false
	}
	payload.walletAddr = payload.walletAddr.toUpperCase()

	if (signAddr !== payload.walletAddr) {
		logger (Color.red(`checkPayloadWalletSign signAddr[${signAddr}] !== payload.walletAddr [${payload.walletAddr}] Error`))
		return false
	}

	return true
}

export const CoNET_SI_Register = ( payload: ICoNET_DL_POST_register_SI, s3pass: s3pass ) => {
	return new Promise ( async resolve=> {

		if (!checkPayloadWalletSign(payload)) {
			return resolve(false)
		}
	
		payload.ip_api = await getIpaddressLocaltion ( payload.ipV4 )
	
		const nft_tokenid = createHash('sha256').update(payload.ipV4).digest('hex')
		payload.nft_tokenid = nft_tokenid
		
		const customs_review_total = (Math.random()*5).toFixed(2)
	
		const cmd0 = `SELECT * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }'`
		
		const cassClient = new Client (option)
		await cassClient.connect ()
			
		let result = await cassClient.execute (cmd0)
	
		const oldData = result?.rows[0]
		const time = new Date ()
		const needDomain = oldData?.pgp_publickey_id === payload.gpgPublicKeyID ? false: true
		let cmd = !result.rowLength
					? `INSERT INTO conet_si_nodes ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online, platform_verison) VALUES (` +
					` '${ payload.walletAddr }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${ customs_review_total }, `+
					`'${ payload.gpgPublicKeyID }', '${ nft_tokenid }', 5, dateof(now()), '${ payload.platform_verison }' ) `

					: `UPDATE conet_si_nodes SET wallet_addr = '${ payload.walletAddr }', outbound_fee = ${ payload.outbound_price }, storage_fee = ${ payload.storage_price }, `+
					`customs_review_total = ${customs_review_total}, `+
					`${ needDomain ? "pgp_publickey_id = '" +  payload.gpgPublicKeyID + "',": '' } platform_verison = '${ payload.platform_verison }', total_online = ${ oldData.total_online + 5 }, last_online = dateof(now()) ` +
					`WHERE nft_tokenid = '${ nft_tokenid }' and country = '${ oldData.country }'`

		logger (inspect(cmd, false, 3, true))
		try {
			await cassClient.execute (cmd)
		} catch (ex) {
			await cassClient.shutdown()
			logger (ex)
			return false
		}
		resolve(nft_tokenid)
		await cassClient.shutdown()
		await postRouterToPublic (payload, null, s3pass)
		needDomain ? await regiestCloudFlare (payload.ipV4, payload.gpgPublicKeyID, masterSetup ): null
		
	})

	
}

export const CoNET_SI_health = async ( yyy: ICoNET_DL_POST_register_SI ) => {

	if (!checkPayloadWalletSign(yyy)) {
		return false
	}
	if (!yyy.nft_tokenid) {
		logger (Color.red(`CoNET_SI_health have no nft_tokenid Error`), inspect( yyy, false, 3, true ))
		return false
	}
	const nft_tokenid = yyy.nft_tokenid

	const cmd = `Select * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }'`
	const cassClient = new Client (option)
	await cassClient.connect ()
	const res = await cassClient.execute (cmd)
	const oldData = res.rows[0]

	if ( !res.rowLength || oldData.pgp_publickey_id !== yyy.gpgPublicKeyID ) {
		await cassClient.shutdown ()
		logger (`CoNET_SI_health ERROR!, SI signPgpKeyID !== oldData.pgp_publickey_id payload = [${ inspect( yyy, false, 3, true ) }] DB = [${ inspect(oldData, false, 3, true) }]` )
		return false
	}
	const customs_review_total = (Math.random()*5).toFixed(2)

	const cmd1 = `UPDATE conet_si_nodes SET customs_review_total = ${ customs_review_total }, total_online = ${ oldData.total_online} + 5, platform_verison = '${ yyy.platform_verison}', last_online = dateof(now()) Where country = '${ oldData.country }' and nft_tokenid = '${ nft_tokenid }'`
	await cassClient.execute (cmd1)
	await cassClient.shutdown ()
	return true

}

export const regiestFaucet = (wallet_addr: string, ipAddr: string ) => {
	
	return new Promise ( async resolve => {

		const cassClient = new Client (option)
		await cassClient.connect ()
		const time = new Date()

		
		let cmd = `SELECT * from conet_faucet_ipaddress WHERE client_ipaddress = '${ipAddr}'`

		let result = await cassClient.execute (cmd)

		if ( result?.rowLength > 9 ) {
			logger (Color.red(`regiestFaucet IP address [${ ipAddr }] over 10 in 24 hours! STOP!`))
			await cassClient.shutdown ()
			return resolve (false)
		}

		wallet_addr = wallet_addr.toUpperCase()

		cmd = `SELECT * from conet_faucet_wallet_addr WHERE wallet_addr = '${ wallet_addr }'`
		result = await cassClient.execute (cmd)
		
		if ( result?.rowLength > 0 ) {
			logger (Color.red(`regiestFauce Wallet Address [${ wallet_addr }] did Faucet in 24 hours! STOP! `))
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
		await cassClient.connect ()
		const time = new Date()
		const cmd = `INSERT INTO conet_market (date, price, value_24hours, token_id) VALUES ('${time.toISOString()}', ${ price }, ${ oneDayPrice }, 'AVAX')`
		await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve (null)
	})
}

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
		await cassClient.connect ()
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
		await cassClient.connect ()
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
			await cassClient.shutdown ()
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

export const mint_conetcash = async (txObj: {tx: string, to: string}, txObjHash: string, sign: string ) => {

	// @ts-ignore
	const _txObjHash = hash.keccak256(txObj)
	if ( txObjHash !== _txObjHash) {
		logger (`mint_conetcash Error: _txObjHash [${_txObjHash}] !== [${ txObjHash }]`)
		return false
	}

	const usdcData = await getConfirmations( txObj.tx, admin_public, USDCNET )
	if ( !usdcData || usdcData.value <= 0 || usdcData.value > 100 ) {
		logger (`mint_conetcash have no usdcData or usdcData.value have not in []`, inspect(usdcData, false, 3, true))
		return false
	}
	
	const cassClient = new Client (option)
	await cassClient.connect ()
	const cmd1 = `SELECT from_transaction_hash from conet_dl_conetcash where asset_name = '${ asset_name }' and from_transaction_hash = '${ txObj.tx.toUpperCase()}'`
	const rowLength = (await cassClient.execute (cmd1)).rowLength
	if (rowLength > 0) {
		await cassClient.shutdown ()
		logger (`mint_conetcash ERROR: had same txHash [${ txObj.tx }]`)
		return false
	}

	txObj.to = txObj.to.toUpperCase()


	const keyID: string = recover(sign, _txObjHash).toUpperCase()
	if (keyID !== usdcData.from.toUpperCase()) {
		return false
	}

	
	const time = new Date()
	const fee = usdcData.value * CoNETCashFee
	const balance = usdcData.value - fee
	const id = v4().toUpperCase()
	const cmd2 = `INSERT INTO conet_dl_conetcash (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
		`'${txObj.to}', '${ asset_name }', '${ txObj.tx.toUpperCase() }', '${ time.toISOString() }', ${ usdcData.value }, ${ balance }, '${ id }', ${ fee }, 0)`
	await cassClient.execute (cmd2)
	const cmd3 = `INSERT INTO conet_dl_conetcash_dl_id (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
		`'${ txObj.to }', '${ asset_name }', '${ txObj.tx.toUpperCase() }', '${ time.toISOString() }', ${ usdcData.value }, ${ balance }, '${ id }', ${ fee }, 0)`
	await cassClient.execute (cmd3)
	await cassClient.shutdown ()
	return id
}

export const conetcash_getBalance = (id: string ) => {
	return new Promise( async resolve => {
		const cmd1 = `SELECT * from conet_dl_conetcash_dl_id where asset_name='${asset_name}' and dl_id='${ id }'`
		const cassClient = new Client (option)
		await cassClient.connect ()
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

export const getSI_nodes = (sortby: SINodesSortby, region: SINodesRegion, si_pool: any[], si_last_Update_time: number ) => {

	return new Promise ( async resolve => {

		const return_result = () => {
			
			//		Use Pool Data
			
			const random = Math.round(Math.random () * 5)
			if (random < 1) {
				return resolve ({total: 10, rows: si_pool.sort ((a: SI_nodes , b: SI_nodes) => b.customs_review_total - a.customs_review_total).slice(0, 10) })
			} 
			if (random < 2) {
				return resolve ({total: 10, rows: si_pool.sort ((a: SI_nodes , b: SI_nodes) => new Date(b.last_online).getTime() - new Date(a.last_online).getTime()).slice(0, 10) })
			}
			if (random < 3) {
				return resolve ({total: 10, rows: si_pool.sort ((a: SI_nodes , b: SI_nodes) => b.outbound_fee - a.outbound_fee).slice(0, 10) })
			}
			if (random < 4) {
				return resolve ({total: 10, rows: si_pool.sort ((a: SI_nodes , b: SI_nodes) => b.storage_fee - a.storage_fee).slice(0, 10) })
			}
			if (random <= 5) {
				return resolve ({total: 10, rows: si_pool.sort ((a: SI_nodes , b: SI_nodes) => b.total_online - a.total_online).slice(0, 10) })
			}
			
		}

		const overTime = new Date().getTime() - si_last_Update_time > si_last_Update_time_timeout
		if ( si_pool.length && !overTime ){
			return return_result()
		}

		const cassClient = new Client (option)
		await cassClient.connect ()
		const cmd = `SELECT * from conet_si_nodes LIMIT 20`
		let total
		let data
		try {
			data = await cassClient.execute (cmd)
		} catch (ex) {
			await cassClient.shutdown ()
			if (si_pool.length) {
				return return_result()
			}
			return resolve (null)
		}
		await cassClient.shutdown ()
		si_pool = data.rows
		return return_result()
	})
}

export const authorizeCoNETCash = async ( Cobj: CoNETCash_authorized, objHash: string, sign: string ) => {

		// @ts-ignore
		const _txObjHash = hash.keccak256(Cobj)

		if ( _txObjHash !== objHash ) {
			return  (null)
		}

		let signAddr = ''
		let obj: CoNETCash_authorized
		try {
			signAddr = recover(sign, _txObjHash).toUpperCase()
		} catch (ex) {
			logger (Color.red(`authorizeCoNETCash ${Cobj} recover sign & _txObjHash Error`), ex)
			return  (null)
		}

		const cassClient = new Client (option)
		await cassClient.connect ()

		const cmd = `SELECT * from conet_dl_conetcash_dl_id where dl_id = '${ Cobj.id }' and asset_name = '${asset_name}'`

		const result = await cassClient.execute (cmd)

		if ( !result.rows?.length ) {
			await cassClient.shutdown ()
			logger (Color.red(`authorizeCoNETCash ${Cobj} have no record in conet_dl_conetcash_dl_id Error`))
			return (null)
		}
		const row = result.rows[0]
		const fee = Cobj.amount * CoNETCashFee
		const balance = row.balance - fee - Cobj.amount

		if ( row.owner_addr !== signAddr.toUpperCase() || balance < 0 ) {
			await cassClient.shutdown ()
			logger (Color.red(`authorizeCoNETCash owner_addr !== signAddr or balance [${balance}] < amount [${ Cobj.amount }] Error`))
			return (null)
		}
		const transfer_fee_total = row.transfer_fee_total + fee

		const cmd1 = `UPDATE conet_dl_conetcash_dl_id SET balance = ${ balance }, transfer_fee_total = ${ transfer_fee_total } where asset_name = '${asset_name}' and dl_id = '${ Cobj.id }'`
		const cmd2 = `UPDATE conet_dl_conetcash SET balance = ${ balance }, transfer_fee_total = ${ transfer_fee_total } where asset_name = '${asset_name}' and from_transaction_hash = '${ row.from_transaction_hash }'`
		try {
			await cassClient.execute (cmd1)
			await cassClient.execute (cmd2)
		} catch (ex) {
			await cassClient.shutdown ()
			logger (Color.red(`execute (cmd1) execute (cmd2) ERROR` ), ex)
			return (null)
		}
		
		const id = v4().toUpperCase()
		const time = new Date()
		const cmd3 = `INSERT INTO conet_dl_conetcash (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
			`'${Cobj.to}', '${ asset_name }', '${ Cobj.id }', '${ time.toISOString() }', ${ Cobj.amount }, ${ Cobj.amount }, '${ id }', 0, 0)`
		
		const cmd4 = `INSERT INTO conet_dl_conetcash_dl_id (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
			`'${Cobj.to}', '${ asset_name }', '${ Cobj.id }', '${ time.toISOString() }', ${ Cobj.amount }, ${ Cobj.amount }, '${ id }', 0, 0)`
		try {
			await cassClient.execute (cmd3)
			await cassClient.execute (cmd4)
		} catch (ex) {
			await cassClient.shutdown ()
			logger (Color.red(`execute (cmd3) execute (cmd4) ERROR` ), ex)
			return (null)
		}
		
		await cassClient.shutdown ()

		return (id)
	
}

/**
 * 
 * 			TEST
 */


/** */