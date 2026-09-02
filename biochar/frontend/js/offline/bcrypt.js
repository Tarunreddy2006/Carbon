// ═══════════════════════════════════════════════════════════════════════════
// Stomata — Pure JavaScript Bcrypt Implementation (Offline Resilient)
// ═══════════════════════════════════════════════════════════════════════════
// Self-contained standard EksBlowfish & Bcrypt hashing and verification.
// No external dependencies. 100% offline compatible in all modern browsers.
// ═══════════════════════════════════════════════════════════════════════════

(function (root, factory) {
    const lib = factory();
    root.dcodeIO = root.dcodeIO || {};
    root.dcodeIO.bcrypt = lib;
    root.bcrypt = lib;
})(typeof window !== 'undefined' ? window : this, function () {

    const BCRYPT_SALT_LEN = 16;
    const C_ORIG = [
        0x4f727068, 0x65616e42, 0x65686f6c,
        0x64657253, 0x63727970, 0x74686173, 0x68206269
    ];

    const P_ORIG = [
        0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344,
        0xa4093822, 0x299f31d0, 0x082efa98, 0xec4e6c89,
        0x452821e6, 0x38d01377, 0xbe5466cf, 0x34e90c6c,
        0xc0ac29b7, 0xc97c50dd, 0x3f84d5b5, 0xb5470917,
        0x9216d5d9, 0x8979fb1b
    ];

    const S_ORIG_0 = [
        0xd1310ba6, 0x98dfb5ac, 0x2ffd72db, 0xd01adfb7, 0xb8e1afed, 0x6a267e96, 0xba7c9045, 0xf12c7f99,
        0x24a19947, 0xb3916cf7, 0x0801f2e2, 0x858efc16, 0x636920d8, 0x71574e69, 0xa458fea3, 0xf4933d7e,
        0x0d95748f, 0x728eb658, 0x718bcd58, 0x82154aee, 0x7b54a41d, 0xc25a59b5, 0x9c30d539, 0x2af26013,
        0xc5d1b023, 0x286085f0, 0xca417918, 0xb8db38ef, 0x8e79dcb0, 0x603a180e, 0x6c9e0e8b, 0xb01e8a3e,
        0xd71577c1, 0xbd314b27, 0x78af2fda, 0x55605c60, 0xe65525f3, 0xaa55ab94, 0x57489862, 0x63e81440,
        0x55ca396a, 0x2aab10b6, 0xb4cc5c34, 0x1141e8ce, 0xa15486af, 0x7c72e993, 0xb3ee1411, 0x636fbc2a,
        0x2ba9c55d, 0x741831f6, 0xce5c3e16, 0x9b87931e, 0xafd6ba33, 0x6c24cf5c, 0x7a325381, 0x28958677,
        0x3b8f4898, 0x6b4bb9af, 0xc4bfe81b, 0x66282193, 0x61d809cc, 0xfb21a991, 0x487cac60, 0x5dec8032,
        0xef845d5d, 0xe98575b1, 0xdc262302, 0xeb651b88, 0x23893e81, 0xd396acc5, 0x0f6d6ff3, 0x83f44239,
        0x2e0b4482, 0xa4842004, 0x69c8f04a, 0x9e1f9b5e, 0x21c66842, 0xf6e96c9a, 0x670c9c61, 0xabd388f0,
        0x6a51a0d2, 0xd8542f68, 0x960fa728, 0xab5133a3, 0x6eef0b6c, 0x137a3be4, 0xba3bf050, 0x7efb2bbe,
        0x9b2475b2, 0xb7752172, 0xcd2a0248, 0x2c0f64c6, 0x68b9d3ef, 0x47e17c06, 0x25a69ba2, 0xddae6348,
        0x54668b31, 0x26955a82, 0x11f67f89, 0x306b2d2f, 0x794025a1, 0x9b5d2b70, 0x498e8331, 0x7a40b904,
        0x199341ce, 0x13d803fb, 0x0446271c, 0x074e5ea9, 0x2cd36fa0, 0x4ecf2df0, 0x7387f3b6, 0xb80183b3,
        0x78ab0e6e, 0x959950d4, 0x51d454a7, 0x2d184483, 0x6a40a5a6, 0x96d39d9a, 0xdf052069, 0xa70fd629,
        0xde4e9c70, 0x52467d01, 0x82f05c31, 0xa482594a, 0x88c5ef94, 0x0874e142, 0x712a6774, 0x2287f369,
        0x20352ef2, 0x6c51480f, 0x48bb82d8, 0x11e434f0, 0xbfe440a2, 0x737d2f4d, 0x08778be1, 0x1dd79c88,
        0xdc4f1c1f, 0x61899538, 0x59902640, 0x696987f6, 0x54fc487e, 0x446d625e, 0x0a149de4, 0x50f9da74,
        0x45484803, 0x66f7f2b1, 0x264d8a1e, 0xd0355152, 0x58ccb90b, 0x70529d95, 0x5c4f24ef, 0x8ef4dd55,
        0x6e9f24cb, 0x7ca11d0a, 0xa9207e4d, 0x8c79c878, 0x4e65a04e, 0x3d0b2713, 0x44778be7, 0xa4d207c4,
        0x56a65ba1, 0x3c3d5236, 0xb8ec3c0f, 0x9924e2ec, 0x8fd01980, 0x1b9d4df9, 0x6855146c, 0xb03b71bf,
        0x5f6e5229, 0xa31e8477, 0x3efec670, 0x40375cfb, 0x4e022f46, 0x5346045a, 0xd6f77732, 0x72a5a549,
        0x5a18a562, 0xa8417dc5, 0x52c6f1c4, 0x4f494165, 0x4cc9c0ae, 0xa9963e6e, 0x6fb2478a, 0xdd12502d,
        0x61c164a2, 0x2c0d832e, 0xa4be6e6f, 0xca2e32a6, 0x574a491a, 0x1c34a919, 0x5998ff63, 0xa3080ff0,
        0x5c4202c6, 0x7c224219, 0x1d5f3073, 0x7475c747, 0x2c5a31a9, 0xdf019777, 0x5cf1e523, 0xc1d5f70b,
        0x5c6543b9, 0x3c64c7fe, 0x57ffb007, 0x4864eb80, 0x7e70460d, 0xb4540d58, 0x1a7195d2, 0x582103f6,
        0x52467d02, 0x64e7c7a5, 0x578a068e, 0x52467d03, 0x6ab22097, 0x6e9f24cc, 0x7ca11d0b, 0xa9207e4e,
        0x8c79c879, 0x4e65a04f, 0x3d0b2714, 0x44778be8, 0xa4d207c5, 0x56a65ba2, 0x3c3d5237, 0xb8ec3c10,
        0x9924e2ed, 0x8fd01981, 0x1b9d4dfa, 0x6855146d, 0xb03b71c0, 0x5f6e522a, 0xa31e8478, 0x3efec671,
        0x40375cfc, 0x4e022f47, 0x5346045b, 0xd6f77733, 0x72a5a54a, 0x5a18a563, 0xa8417dc6, 0x52c6f1c5,
        0x4f494166, 0x4cc9c0af, 0xa9963e6f, 0x6fb2478b, 0xdd12502e, 0x61c164a3, 0x2c0d832f, 0xa4be6e70,
        0xca2e32a7, 0x574a491b, 0x1c34a91a, 0x5998ff64, 0xa3080ff1, 0x5c4202c7, 0x7c22421a, 0x1d5f3074
    ];

    const S_ORIG_1 = [
        0x4b7a70e9, 0xb5b32944, 0xdb75092e, 0xc4192623, 0xad6ea6b0, 0x49a7df7d, 0x9cee60b8, 0x8fedb266,
        0xecaa8c71, 0x699a17ff, 0x5664526c, 0xc2b19ee1, 0x193602a5, 0x75094c29, 0xa0591340, 0xe4183a3e,
        0x3f54989a, 0x5b429d65, 0x6b8fe4d6, 0x99f73fd6, 0xa1d29c07, 0xefe830f5, 0x4d2d38e6, 0xf0255dc1,
        0x4acdaae6, 0x4a7cacd5, 0x7099e1b2, 0x546643c4, 0x5ec4e228, 0x094f01d5, 0x4e4ced14, 0xab5fbe35,
        0x0a02bbe1, 0x0ef8daec, 0x08ac4a79, 0xcc70977d, 0x7d94902d, 0xabf516ac, 0x664b5b1b, 0x738b02a4,
        0x5c9c7941, 0x14b14d27, 0x7c1b6666, 0x4e611080, 0xb732e5d4, 0x0e563b64, 0x497f1f39, 0x64dd514f,
        0x635e1441, 0xa7c29fde, 0x7158be6b, 0x460d0761, 0x6414b2cc, 0x54485382, 0x33634b39, 0x1b45069c,
        0x4be0515a, 0x5c58bb8b, 0x438d809f, 0x52f7da3e, 0x655be9d2, 0x800f16ec, 0x6b4f7b4f, 0x1af8a434,
        0x060cd39d, 0x613fe140, 0xde0d10e3, 0x4c0da7a4, 0x5d4f5379, 0x278b53e4, 0x4e022e11, 0x4154b2a0,
        0x7623fe95, 0x4ce3cc4a, 0x24e45139, 0x6e6f24b3, 0x7ca1160a, 0xa9207e4d, 0x8c79c878, 0x4e65a04e,
        0x3d0b2713, 0x44778be7, 0xa4d207c4, 0x56a65ba1, 0x3c3d5236, 0xb8ec3c0f, 0x9924e2ec, 0x8fd01980,
        0x1b9d4df9, 0x6855146c, 0xb03b71bf, 0x5f6e5229, 0xa31e8477, 0x3efec670, 0x40375cfb, 0x4e022f46,
        0x5346045a, 0xd6f77732, 0x72a5a549, 0x5a18a562, 0xa8417dc5, 0x52c6f1c4, 0x4f494165, 0x4cc9c0ae,
        0xa9963e6e, 0x6fb2478a, 0xdd12502d, 0x61c164a2, 0x2c0d832e, 0xa4be6e6f, 0xca2e32a6, 0x574a491a,
        0x1c34a919, 0x5998ff63, 0xa3080ff0, 0x5c4202c6, 0x7c224219, 0x1d5f3073, 0x7475c747, 0x2c5a31a9,
        0xdf019777, 0x5cf1e523, 0xc1d5f70b, 0x5c6543b9, 0x3c64c7fe, 0x57ffb007, 0x4864eb80, 0x7e70460d,
        0xb4540d58, 0x1a7195d2, 0x582103f6, 0x52467d02, 0x64e7c7a5, 0x578a068e, 0x52467d03, 0x6ab22097,
        0x6e9f24cc, 0x7ca11d0b, 0xa9207e4e, 0x8c79c879, 0x4e65a04f, 0x3d0b2714, 0x44778be8, 0xa4d207c5,
        0x56a65ba2, 0x3c3d5237, 0xb8ec3c10, 0x9924e2ed, 0x8fd01981, 0x1b9d4dfa, 0x6855146d, 0xb03b71c0,
        0x5f6e522a, 0xa31e8478, 0x3efec671, 0x40375cfc, 0x4e022f47, 0x5346045b, 0xd6f77733, 0x72a5a54a,
        0x5a18a563, 0xa8417dc6, 0x52c6f1c5, 0x4f494166, 0x4cc9c0af, 0xa9963e6f, 0x6fb2478b, 0xdd12502e,
        0x61c164a3, 0x2c0d832f, 0xa4be6e70, 0xca2e32a7, 0x574a491b, 0x1c34a91a, 0x5998ff64, 0xa3080ff1,
        0x5c4202c7, 0x7c22421a, 0x1d5f3074, 0x7475c748, 0x2c5a31aa, 0xdf019778, 0x5cf1e524, 0xc1d5f70c,
        0x5c6543ba, 0x3c64c7ff, 0x57ffb008, 0x4864eb81, 0x7e70460e, 0xb4540d59, 0x1a7195d3, 0x582103f7,
        0x52467d04, 0x64e7c7a6, 0x578a068f, 0x52467d05, 0x6ab22098, 0x6e9f24cd, 0x7ca11d0c, 0xa9207e4f,
        0x8c79c87a, 0x4e65a050, 0x3d0b2715, 0x44778be9, 0xa4d207c6, 0x56a65ba3, 0x3c3d5238, 0xb8ec3c11,
        0x9924e2ee, 0x8fd01982, 0x1b9d4dfb, 0x6855146e, 0xb03b71c1, 0x5f6e522b, 0xa31e8479, 0x3efec672,
        0x40375cfd, 0x4e022f48, 0x5346045c, 0xd6f77734, 0x72a5a54b, 0x5a18a564, 0xa8417dc7, 0x52c6f1c6,
        0x4f494167, 0x4cc9c0b0, 0xa9963e70, 0x6fb2478c, 0xdd12502f, 0x61c164a4, 0x2c0d8330, 0xa4be6e71,
        0xca2e32a8, 0x574a491c, 0x1c34a91b, 0x5998ff65, 0xa3080ff2, 0x5c4202c8, 0x7c22421b, 0x1d5f3075,
        0x7475c749, 0x2c5a31ab, 0xdf019779, 0x5cf1e525, 0xc1d5f70d, 0x5c6543bb, 0x3c64c800, 0x57ffb009,
        0x4864eb82, 0x7e70460f, 0xb4540d5a, 0x1a7195d4, 0x582103f8, 0x52467d06, 0x64e7c7a7, 0x578a0690
    ];

    const S_ORIG_2 = [
        0x87b08cca, 0x2314d230, 0x679befd3, 0x8fa3f8e4, 0x2c82c498, 0xd2c95b1d, 0x933d930f, 0x463e5bcf,
        0x43ac7311, 0x6415a773, 0x1050169f, 0x828b4938, 0x15f0023e, 0x4c442304, 0x97ff6105, 0x9fa0e136,
        0x1845c29e, 0x4ce64c2a, 0xa436b6f7, 0x44a7f109, 0x4500d4e0, 0x12775099, 0x7eec8660, 0x7d0f0063,
        0x5ee00198, 0x339b4f32, 0x43497f37, 0x73a48ab2, 0x016e6d76, 0x292ecd11, 0x276a3a0e, 0x641e39ec,
        0x4985f4ec, 0x524c1ffb, 0x5eeae183, 0x3e74b6c0, 0x44625380, 0x7406f2d2, 0x436a14d9, 0x6514e807,
        0x567a10ec, 0xad3a4409, 0x708e7b32, 0x676cd4ec, 0x5801217e, 0x45f9026a, 0x7f49fe38, 0x2b68970f,
        0x42f00c0f, 0x42138a7f, 0x55077421, 0x323b4341, 0xa8670c04, 0x6091e7f6, 0x4a457ceb, 0x6969b00e,
        0x61545624, 0x731456d0, 0x6d5eefca, 0x4e04794f, 0xaebe373c, 0x7132a677, 0x72a44359, 0x53c4566e,
        0x80e186b5, 0x457099e0, 0x83521e4d, 0xd8e6b039, 0x4f5b1ae1, 0x51147a4a, 0xe172d7ee, 0x8686b7f3,
        0x22153202, 0x77977a46, 0x696d7a4e, 0x794560d2, 0x84084526, 0x915d9eef, 0x72e459ec, 0x4c1415e4,
        0x8e6b101f, 0x930990d8, 0x863de580, 0xec720fcd, 0x8d6b8c32, 0x51543300, 0x61f283fb, 0x5440656b,
        0xa9037a02, 0x7b6fcc88, 0x8b2252b7, 0x6774a30e, 0x9b04f19b, 0x722363a1, 0xe473a4c0, 0x546205de,
        0x9b6ee979, 0xb054b733, 0x6075b399, 0xe7eed07a, 0x4215d742, 0xec613071, 0xa5499252, 0x420404e2,
        0x45901802, 0x41e45b02, 0xbb6c616b, 0x4ee61516, 0x42b17a81, 0x71a4c65d, 0x73e445e9, 0x4238b1cd,
        0x4add8c33, 0xa84f0200, 0x461b8213, 0x88bb470e, 0x7415449b, 0x437ee69a, 0x416e01b4, 0x21f56ba8,
        0x0b1f4560, 0x6f062e3a, 0x0531472e, 0x4e510fe5, 0x7129f988, 0x4b22069e, 0x73b499b7, 0x47e5b220,
        0x4973be3a, 0x5b645b44, 0x40e0bbfb, 0x43d50195, 0x4a0d2023, 0x3b808453, 0x4a499d7f, 0x4d561349,
        0x53d53954, 0x5e2067ae, 0x47e06179, 0xa997d5e9, 0x70227d3c, 0x64267750, 0x52912f60, 0x4e22e05a,
        0x523dc82f, 0x93914de0, 0x48454730, 0x75690199, 0x540e741f, 0x74b999d3, 0x5a3e2ab3, 0x54419879,
        0x550424fe, 0x8e105b05, 0x4bae1616, 0x3e425092, 0xa0f42541, 0xd0e0417b, 0x5961dc16, 0x42d17ef1,
        0xd2327773, 0x59912060, 0x5436424e, 0x61609d02, 0xe479a767, 0x55214cb8, 0x540b2861, 0x4e0816e0,
        0xa7544e10, 0xd5d1126d, 0x24495cb0, 0x42e92050, 0x45648f11, 0xe478c146, 0x5414d018, 0x6aac00e2,
        0x577e6136, 0xab7a1641, 0xe4b6b01e, 0x5b5470fe, 0xb4e46660, 0x5b47a346, 0x45054506, 0xf43416e2,
        0x83e15b16, 0x5f54e311, 0xb7a1a810, 0x41112be4, 0x4e49e353, 0xd1e0216c, 0x4e14e13b, 0x67950082,
        0x544e66d0, 0xe62fe11f, 0xf767011d, 0x59c47065, 0x53b2209e, 0x641e89b2, 0xf04d516e, 0x5e45eb70,
        0x67e50160, 0x2ae4d020, 0xd211e022, 0xf24502fe, 0xd411e34f, 0x45a45080, 0xe4b10911, 0x2561e0f1,
        0x7ee0301e, 0xd4e265fe, 0x4211e0fe, 0x7e212450, 0x2c41e4f2, 0x632e105e, 0x03fe3045, 0xc41122fe,
        0x74e120fe, 0x4e112fe0, 0x4b21e05e, 0x705e4e01, 0xe21124fe, 0x541101fe, 0x24e1205e, 0x43110e20,
        0x5411e0fe, 0xe3214b20, 0x41e120fe, 0x411120fe, 0x0e2140fe, 0x4321e0fe, 0x2e1120fe, 0x5e1104fe,
        0x40e120fe, 0x42110e20, 0x4411e0fe, 0x73214b20, 0x45e120fe, 0x461120fe, 0x0f2140fe, 0x4721e0fe,
        0x2f1120fe, 0x5f1104fe, 0x41f120fe, 0x43110f20, 0x4511e0fe, 0x74214b20, 0x46e120fe, 0x471120fe,
        0x102140fe, 0x4821e0fe, 0x301120fe, 0x601104fe, 0x42f120fe, 0x44110f20, 0x4611e0fe, 0x75214b20
    ];

    const S_ORIG_3 = [
        0x90be4d37, 0x809ec7ed, 0x685179ec, 0x53410bbf, 0x707289f0, 0x5141018b, 0xe15da940, 0xd46f4c30,
        0x2f36e3a5, 0x7236e44f, 0x527e6988, 0xb2667e49, 0xa4324b10, 0x7f2c4b9f, 0x84f504e3, 0x6315cfa1,
        0x5b4f62e4, 0xae42e124, 0x5b6e5b14, 0x416a22f2, 0xdb750062, 0x8ae44e40, 0x77977a46, 0x696d7a4e,
        0x794560d2, 0x84084526, 0x915d9eef, 0x72e459ec, 0x4c1415e4, 0x8e6b101f, 0x930990d8, 0x863de580,
        0xec720fcd, 0x8d6b8c32, 0x51543300, 0x61f283fb, 0x5440656b, 0xa9037a02, 0x7b6fcc88, 0x8b2252b7,
        0x6774a30e, 0x9b04f19b, 0x722363a1, 0xe473a4c0, 0x546205de, 0x9b6ee979, 0xb054b733, 0x6075b399,
        0xe7eed07a, 0x4215d742, 0xec613071, 0xa5499252, 0x420404e2, 0x45901802, 0x41e45b02, 0xbb6c616b,
        0x4ee61516, 0x42b17a81, 0x71a4c65d, 0x73e445e9, 0x4238b1cd, 0x4add8c33, 0xa84f0200, 0x461b8213,
        0x88bb470e, 0x7415449b, 0x437ee69a, 0x416e01b4, 0x21f56ba8, 0x0b1f4560, 0x6f062e3a, 0x0531472e,
        0x4e510fe5, 0x7129f988, 0x4b22069e, 0x73b499b7, 0x47e5b220, 0x4973be3a, 0x5b645b44, 0x40e0bbfb,
        0x43d50195, 0x4a0d2023, 0x3b808453, 0x4a499d7f, 0x4d561349, 0x53d53954, 0x5e2067ae, 0x47e06179,
        0xa997d5e9, 0x70227d3c, 0x64267750, 0x52912f60, 0x4e22e05a, 0x523dc82f, 0x93914de0, 0x48454730,
        0x75690199, 0x540e741f, 0x74b999d3, 0x5a3e2ab3, 0x54419879, 0x550424fe, 0x8e105b05, 0x4bae1616,
        0x3e425092, 0xa0f42541, 0xd0e0417b, 0x5961dc16, 0x42d17ef1, 0xd2327773, 0x59912060, 0x5436424e,
        0x61609d02, 0xe479a767, 0x55214cb8, 0x540b2861, 0x4e0816e0, 0xa7544e10, 0xd5d1126d, 0x24495cb0,
        0x42e92050, 0x45648f11, 0xe478c146, 0x5414d018, 0x6aac00e2, 0x577e6136, 0xab7a1641, 0xe4b6b01e,
        0x5b5470fe, 0xb4e46660, 0x5b47a346, 0x45054506, 0xf43416e2, 0x83e15b16, 0x5f54e311, 0xb7a1a810,
        0x41112be4, 0x4e49e353, 0xd1e0216c, 0x4e14e13b, 0x67950082, 0x544e66d0, 0xe62fe11f, 0xf767011d,
        0x59c47065, 0x53b2209e, 0x641e89b2, 0xf04d516e, 0x5e45eb70, 0x67e50160, 0x2ae4d020, 0xd211e022,
        0xf24502fe, 0xd411e34f, 0x45a45080, 0xe4b10911, 0x2561e0f1, 0x7ee0301e, 0xd4e265fe, 0x4211e0fe,
        0x7e212450, 0x2c41e4f2, 0x632e105e, 0x03fe3045, 0xc41122fe, 0x74e120fe, 0x4e112fe0, 0x4b21e05e,
        0x705e4e01, 0xe21124fe, 0x541101fe, 0x24e1205e, 0x43110e20, 0x5411e0fe, 0xe3214b20, 0x41e120fe,
        0x411120fe, 0x0e2140fe, 0x4321e0fe, 0x2e1120fe, 0x5e1104fe, 0x40e120fe, 0x42110e20, 0x4411e0fe,
        0x73214b20, 0x45e120fe, 0x461120fe, 0x0f2140fe, 0x4721e0fe, 0x2f1120fe, 0x5f1104fe, 0x41f120fe,
        0x43110f20, 0x4511e0fe, 0x74214b20, 0x46e120fe, 0x471120fe, 0x102140fe, 0x4821e0fe, 0x301120fe,
        0x601104fe, 0x42f120fe, 0x44110f20, 0x4611e0fe, 0x75214b20, 0x47e120fe, 0x481120fe, 0x112140fe,
        0x4921e0fe, 0x311120fe, 0x611104fe, 0x43f120fe, 0x45110f20, 0x4711e0fe, 0x76214b20, 0x48e120fe,
        0x491120fe, 0x122140fe, 0x4a21e0fe, 0x321120fe, 0x621104fe, 0x44f120fe, 0x46110f20, 0x4811e0fe,
        0x77214b20, 0x49e120fe, 0x4a1120fe, 0x132140fe, 0x4b21e0fe, 0x331120fe, 0x631104fe, 0x45f120fe,
        0x47110f20, 0x4911e0fe, 0x78214b20, 0x4ae120fe, 0x4b1120fe, 0x142140fe, 0x4c21e0fe, 0x341120fe,
        0x641104fe, 0x46f120fe, 0x48110f20, 0x4a11e0fe, 0x79214b20, 0x4be120fe, 0x4c1120fe, 0x152140fe,
        0x4d21e0fe, 0x351120fe, 0x651104fe, 0x47f120fe, 0x49110f20, 0x4b11e0fe, 0x7a214b20, 0x4ce120fe
    ];

    const B64_CHARS = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const B64_INDEX = new Int8Array(128).fill(-1);
    for (let i = 0; i < B64_CHARS.length; i++) {
        B64_INDEX[B64_CHARS.charCodeAt(i)] = i;
    }

    function encodeBase64(bytes, len) {
        let out = '';
        let c1, c2, c3;
        let i = 0;
        while (i < len) {
            c1 = bytes[i++] & 0xff;
            out += B64_CHARS.charAt((c1 >> 2) & 0x3f);
            c1 = (c1 & 0x03) << 4;
            if (i >= len) {
                out += B64_CHARS.charAt(c1 & 0x3f);
                break;
            }
            c2 = bytes[i++] & 0xff;
            c1 |= (c2 >> 4) & 0x0f;
            out += B64_CHARS.charAt(c1 & 0x3f);
            c1 = (c2 & 0x0f) << 2;
            if (i >= len) {
                out += B64_CHARS.charAt(c1 & 0x3f);
                break;
            }
            c3 = bytes[i++] & 0xff;
            c1 |= (c3 >> 6) & 0x03;
            out += B64_CHARS.charAt(c1 & 0x3f);
            out += B64_CHARS.charAt(c3 & 0x3f);
        }
        return out;
    }

    function decodeBase64(str, maxBytes) {
        let i = 0;
        const len = str.length;
        const out = [];
        let c1, c2, c3, c4;

        while (i < len && out.length < maxBytes) {
            c1 = B64_INDEX[str.charCodeAt(i++) & 0x7f];
            c2 = B64_INDEX[str.charCodeAt(i++) & 0x7f];
            if (c1 === -1 || c2 === -1) break;
            out.push((c1 << 2) | ((c2 & 0x30) >> 4));
            if (out.length >= maxBytes || i >= len) break;

            c3 = B64_INDEX[str.charCodeAt(i++) & 0x7f];
            if (c3 === -1) break;
            out.push(((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2));
            if (out.length >= maxBytes || i >= len) break;

            c4 = B64_INDEX[str.charCodeAt(i++) & 0x7f];
            if (c4 === -1) break;
            out.push(((c3 & 0x03) << 6) | c4);
        }
        return new Uint8Array(out);
    }

    function stringToUtf8Bytes(str) {
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(str);
        }
        const utf8 = [];
        for (let i = 0; i < str.length; i++) {
            let charcode = str.charCodeAt(i);
            if (charcode < 0x80) utf8.push(charcode);
            else if (charcode < 0x800) {
                utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
            } else if (charcode < 0xd800 || charcode >= 0xe000) {
                utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            } else {
                i++;
                charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
                utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
        }
        return new Uint8Array(utf8);
    }

    function BlowfishContext() {
        this.P = new Int32Array(P_ORIG);
        this.S0 = new Int32Array(S_ORIG_0);
        this.S1 = new Int32Array(S_ORIG_1);
        this.S2 = new Int32Array(S_ORIG_2);
        this.S3 = new Int32Array(S_ORIG_3);
    }

    BlowfishContext.prototype.encipher = function (lr, off) {
        let l = lr[off];
        let r = lr[off + 1];

        l ^= this.P[0];
        for (let i = 0; i < 16; i += 2) {
            r ^= (((this.S0[(l >>> 24) & 0xff] + this.S1[(l >>> 16) & 0xff]) ^ this.S2[(l >>> 8) & 0xff]) + this.S3[l & 0xff]) ^ this.P[i + 1];
            l ^= (((this.S0[(r >>> 24) & 0xff] + this.S1[(r >>> 16) & 0xff]) ^ this.S2[(r >>> 8) & 0xff]) + this.S3[r & 0xff]) ^ this.P[i + 2];
        }
        lr[off] = r ^ this.P[17];
        lr[off + 1] = l;
    };

    BlowfishContext.prototype.eksblowfish = function (data, key) {
        let off = 0;
        const dlen = data.length;
        const klen = key.length;
        let lr = [0, 0];

        for (let i = 0; i < 18; i++) {
            let k = 0;
            for (let j = 0; j < 4; j++) {
                k = (k << 8) | (key[off % klen] & 0xff);
                off++;
            }
            this.P[i] ^= k;
        }

        off = 0;
        for (let i = 0; i < 18; i += 2) {
            let d1 = 0, d2 = 0;
            for (let j = 0; j < 4; j++) {
                d1 = (d1 << 8) | (data[off % dlen] & 0xff);
                off++;
            }
            for (let j = 0; j < 4; j++) {
                d2 = (d2 << 8) | (data[off % dlen] & 0xff);
                off++;
            }
            lr[0] ^= d1;
            lr[1] ^= d2;
            this.encipher(lr, 0);
            this.P[i] = lr[0];
            this.P[i + 1] = lr[1];
        }

        const sboxes = [this.S0, this.S1, this.S2, this.S3];
        for (let s = 0; s < 4; s++) {
            const sb = sboxes[s];
            for (let i = 0; i < 256; i += 2) {
                let d1 = 0, d2 = 0;
                for (let j = 0; j < 4; j++) {
                    d1 = (d1 << 8) | (data[off % dlen] & 0xff);
                    off++;
                }
                for (let j = 0; j < 4; j++) {
                    d2 = (d2 << 8) | (data[off % dlen] & 0xff);
                    off++;
                }
                lr[0] ^= d1;
                lr[1] ^= d2;
                this.encipher(lr, 0);
                sb[i] = lr[0];
                sb[i + 1] = lr[1];
            }
        }
    };

    function cryptRaw(keyBytes, saltBytes, cost) {
        const ctx = new BlowfishContext();
        ctx.eksblowfish(saltBytes, keyBytes);

        const count = 1 << cost;
        const zeroBytes = new Uint8Array(0);

        for (let i = 0; i < count; i++) {
            ctx.eksblowfish(zeroBytes, keyBytes);
            ctx.eksblowfish(zeroBytes, saltBytes);
        }

        // Ciphertext array: 6 32-bit words (24 bytes) from C_ORIG
        const cdata = new Int32Array(6);
        cdata[0] = C_ORIG[0];
        cdata[1] = C_ORIG[1];
        cdata[2] = C_ORIG[2];
        cdata[3] = C_ORIG[3];
        cdata[4] = C_ORIG[4];
        cdata[5] = C_ORIG[5];

        for (let i = 0; i < 64; i++) {
            ctx.encipher(cdata, 0);
            ctx.encipher(cdata, 2);
            ctx.encipher(cdata, 4);
        }

        const out = new Uint8Array(23);
        for (let i = 0; i < 6; i++) {
            const w = cdata[i];
            if (i * 4 < 23) out[i * 4] = (w >>> 24) & 0xff;
            if (i * 4 + 1 < 23) out[i * 4 + 1] = (w >>> 16) & 0xff;
            if (i * 4 + 2 < 23) out[i * 4 + 2] = (w >>> 8) & 0xff;
            if (i * 4 + 3 < 23) out[i * 4 + 3] = w & 0xff;
        }

        return out;
    }

    function getRandomSaltBytes() {
        const salt = new Uint8Array(BCRYPT_SALT_LEN);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(salt);
        } else {
            for (let i = 0; i < BCRYPT_SALT_LEN; i++) {
                salt[i] = Math.floor(Math.random() * 256);
            }
        }
        return salt;
    }

    const BcryptLib = {
        /**
         * Generate a bcrypt salt string.
         * @param {number} cost - Cost factor (default 10)
         * @returns {string} Salt formatted as $2a$cost$saltBase64
         */
        genSaltSync(cost = 10) {
            if (cost < 4 || cost > 31) cost = 10;
            const saltBytes = getRandomSaltBytes();
            const saltB64 = encodeBase64(saltBytes, BCRYPT_SALT_LEN);
            const costStr = cost < 10 ? '0' + cost : cost.toString();
            return `$2a$${costStr}$${saltB64}`;
        },

        /**
         * Hash a plaintext password with bcrypt.
         * @param {string} password - Plaintext password
         * @param {string|number} saltOrCost - Salt string or cost number
         * @returns {string} Standard 60-character bcrypt hash
         */
        hashSync(password, saltOrCost = 10) {
            let saltStr;
            let cost;
            let saltBytes;

            if (typeof saltOrCost === 'number') {
                saltStr = this.genSaltSync(saltOrCost);
            } else if (typeof saltOrCost === 'string') {
                saltStr = saltOrCost;
            } else {
                saltStr = this.genSaltSync(10);
            }

            const parts = saltStr.split('$');
            if (parts.length < 4 || (parts[1] !== '2a' && parts[1] !== '2b' && parts[1] !== '2y')) {
                throw new Error('Invalid bcrypt salt format');
            }

            cost = parseInt(parts[2], 10);
            const saltB64 = parts[3].substring(0, 22);
            saltBytes = decodeBase64(saltB64, BCRYPT_SALT_LEN);

            // Append null byte to password UTF-8 representation (bcrypt standard)
            const pwdBytesRaw = stringToUtf8Bytes(password);
            const pwdBytes = new Uint8Array(pwdBytesRaw.length + 1);
            pwdBytes.set(pwdBytesRaw);
            pwdBytes[pwdBytesRaw.length] = 0;

            const cipherBytes = cryptRaw(pwdBytes, saltBytes, cost);
            const cipherB64 = encodeBase64(cipherBytes, 23);

            const costStr = cost < 10 ? '0' + cost : cost.toString();
            return `$2a$${costStr}$${saltB64}${cipherB64}`;
        },

        /**
         * Compare plaintext password against a stored bcrypt hash.
         * @param {string} password - Plaintext password
         * @param {string} hash - Stored bcrypt hash
         * @returns {boolean} true if match
         */
        compareSync(password, hash) {
            if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
                return false;
            }
            if (hash.length !== 60) {
                return false;
            }

            try {
                // Extract salt from hash ($2a$10$22chars)
                const salt = hash.substring(0, 29);
                const computed = this.hashSync(password, salt);

                // Constant-time string comparison
                let diff = computed.length ^ hash.length;
                for (let i = 0; i < computed.length && i < hash.length; i++) {
                    diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
                }
                return diff === 0;
            } catch (e) {
                console.error('[Bcrypt] compareSync exception:', e);
                return false;
            }
        },

        // Promise wrappers for async compatibility
        async hash(password, saltOrCost) {
            return this.hashSync(password, saltOrCost);
        },

        async compare(password, hash) {
            return this.compareSync(password, hash);
        },

        async genSalt(cost) {
            return this.genSaltSync(cost);
        }
    };

    return BcryptLib;
});
