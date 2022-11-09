interface ICoNET_NodeSetup {
	ipV4: string
	ipV4Port: number
	ipV6: string
	ipV6Port: number
	keychain: any
	setupPath: string
	keyObj: any
}

interface ICoNET_certificate {
    key: string
    cert: string
    ca: string
	rejectUnauthorized: boolean
}

interface ICoNET_DL_POST_register_SI {
	wallet_CoNET: string
	ipV4: string
	storage_price: number
	outbound_price: number
	wallet_CNTCash: string
	ipV4Port: number
	ip_api: ICoNET_IP_API_Result
}

interface ICoNET_DecryptedPayload {
	payload: ICoNET_DL_POST_register_SI|any
	senderAddress: string
	publickey: string
	
}

interface ICoNET_DL_masterSetup {
    "13b995b1fDotCa":{
        Key: string
        cert: string 
    },
    Cassandra: {
        databaseEndPoints: string[]
        auth: {
            username: string
            password: string
        }
        certificate: ICoNET_certificate
        keyspace: string

    }
    seguroWebhook: {
        path: string
        Secret_key: string
        endpointSecret: string
    }
    CoNETPubSub: {
        port_number: number
        certificate: ICoNET_certificate
        client: ICoNET_certificate
    }
	master_wallet_public: string
	master_wallet_private: string
}

interface ICoNET_IP_API_Result {
	status: string
	country: string
	countryCode: string
	region: string
	regionName: string
	city: string
	zip: string
	lat: number
	lon: number
	timezone: string
	isp: string
	org: string
	as: string
	query: string
	location: string
}