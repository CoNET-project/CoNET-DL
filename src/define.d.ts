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
	pgpPublicKey: string
	ipV4: string
	storage_price: number
	outbound_price: number
	ipV4Port: number
	ip_api?: any
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
    }
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
	cloudflare: {
		X_Auth_Email: string
		X_Auth_Key: string
		endpoint: string
		zoneID: string
		domainname: string
		path: string
	}
	ssl: {
		certificate: string
		key: string
	}
	passwd: string
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

interface s3pass {
	ACCESS_KEY: string
	SECRET_KEY: string
}

interface ICoNET_GPG_PublickeySignResult {
	armoredPublicKey: string
	publicKeyID: string
}


interface ICoNET_Router {
	gpgPublicKeyID: string
	armoredPublicKey: string
	walletAddr: string
	walletPublicArmored: string
	ipv4: string
	nickName: string
	profileImg: string
	emailAddr: string
	forward?: string
}

type SINodesSortby = 'CUSTOMER_REVIEW'|'TOTAL_ONLINE_TIME'|
	'STORAGE_PRICE_LOW'|'STORAGE_PRICE_HIGH'|'OUTBOUND_PRICE_HIGH'|'OUTBOUND_PRICE_LOW'
	
type SINodesRegion = 'USA'|'UK'|'ES'|'DE'