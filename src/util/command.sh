curl -v -d '{"message":"{\\"walletAddress\\":\\"0x767E88C4AFEAF9F513F1262675C83F19511EA2E9\\",\\"referrer\\":\\"0x31d944fa2b1d8cba732235c38035e5d37881f51b\\"}","signMessage":"0x28cb78ae4c78c237c87953911a9d00e4bf71913c29c07db0ef18774948283b7867a7e687e53fc20b8f4c2debea19f3fe6d2ef4e7cea8916198141f0d9f36b0fd1c"}' -H "Content-Type: application/json" -X POST "https://openpgp.online:4001/api/registerReferrer"

curl -v -d '{"key1":"value1", "key2":"value2"}' -H "Content-Type: application/json" -X POST "https://openpgp.online:4001/api/registerReferrer"

curl  -H "Content-Type: application/json" "https://scan.conet.network/api?module=account&action=tokenbalance&contractaddress=0x0f43685B2cB08b9FB8Ca1D981fF078C22Fec84c5&address=0x3A5BC5DD073C8ED4BEC9AD66497FBBD9FC588A4A"