
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion  } from '../util/util'
import { createHash } from 'node:crypto'
import { waterfall, series } from 'async'
import Color from 'colors/safe'

import { Client, auth, types, } from 'cassandra-driver'

const setup = platform() === 'darwin' ? join( __dirname, '../../','src', 'master.json' ): join( homedir(), 'master.json' )

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

const init_tables = ( cassClient: any, Callback: any ) => {
	const blockDevice =
	`CREATE TABLE IF NOT EXISTS conet_si_nodes (`+								//		
	`wallet_addr text, ` +														//		node wallet address
	`ip_addr text, ` +															//		node IP address
	`outbound_fee FLOAT,` +														//		USDC 1MB outbound
	`storage_fee FLOAT,` +														//		USDC 1MB storgag/1 hour   1TB = $10 1MB (10/1000)= $0.01  $0.0000138900/hour
	`customs_review_ratings map <text, int>,` +									//		0-100 
	`customs_review_total int,` +												//		Total ratings
	`country text,` +															//		US, EU, Asia, 
	`region text, ` +
	`lat FLOAT, ` +
	`lon FLOAT,` +
	`outbound_total int,` +														//		MB
	`storage_total int,` +														//		MB
	`revenue_total FLOAT,` +													//		USDC
	`registration_date text,` +													//		Date
	`nft_tokenid text,` +														//		Date
	`online timestamp,` +	
	`public_key text, ` +
	`PRIMARY KEY ((nft_tokenid), country ))`
	
	
	const FaucetRecord =
	`CREATE TABLE IF NOT EXISTS conet_faucet (`+								//
	`wallet_addr text,` +
	`total int,` +
	`expired boolean,` +
	`timestamp text,` +
	`PRIMARY KEY ((wallet_addr), timestamp ))`
	
	return series ([
		next => cassClient.execute ( blockDevice, next ),
		next => cassClient.execute ( FaucetRecord, next ),
	], Callback)
}

const initDatabase = (Callback: (err?: any )=> void) => {
	
	const cassClient = new Client (option)

	/**
	 * 				Table for CoNET-DL nodes
	 * 				
	 * 
	*/




	return series ([
		next => cassClient.connect ( next ),
		next => init_tables ( cassClient, next )
	], err => {
		return cassClient.shutdown (() => {
			Callback (err)
		})
	})

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
	}). catch (ex => {
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
/****************************************************************************
 * 
 * 			TEST AREA
 * 
 ***************************************************************************/



initDatabase ( err => {
	if ( err ) {
		return logger ( err )
	}
	logger ('success')
})
/** */

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

CoNET_SI_Register(uu)
/** */