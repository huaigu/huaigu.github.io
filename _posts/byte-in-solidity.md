---
title: Solidity中的Byte数组
date: 2022-07-31 12:20:06
tags: bytes, solidity
---

### Big-Endian and Little-Endian

* 字符串、bytes采用Big-Endian格式
  
  例如"abcd"，会被存储为
  
  ```
  0x6162636400000000000000000000000000000000000000000000000000000000
  ```
- uint, address等采用Little-Endian格式
  
  例如```uint256 i = 1```, 会被存储为
  
  ```
  0x0000000000000000000000000000000000000000000000000000000000000001
  ```

### 如何在Remix中输入bytes相关的参数

以参数类型bytes32为例，bytes不定长数组可随意长度。

```solidity
 bytes32 public bytes32Storage;
 function storeBytes32Parameters(bytes32 bytesArray) public returns (bytes32){
     bytes32Storage  = bytesArray;
     return bytesArray;
 }
```

在remix中输入

```
"0x1234567812345678123456781234567812345678123456781234567812345678"
```



两个字符占用一个字节，上述字符串长度64，正好是32个字节。如果输入不是32个字节，调用会报错。

### 定长数组/动态长度数组

* 定长数组, bytes[K], k可以是1-32， 比如``bytes8``,代表长度是8的字节数组。
  
  **声明定长字节数组不需要指定位置**
  
  ```solidity
  bytes32 byteArray; // correct
  bytes32 memory byteArray2; // Data location can only be specified for array, struct or mapping types, but "memory" was given.
  ```
  
  **定长字节数组不可按索引修改内容**
  
  ```solidity
  bytes32 byteArray;
  byteArrays[1] = 0x01;  //  Single bytes in fixed bytes arrays cannot be modified.
  ```
  
  这种定长数组一般有一下几种用途
  
  - 作为函数的传入参数, 比如 `function vote(bytes32 unionId) external`
  
  - 作为函数局部变量/返回值
    
    ```solidity
     function convertStringToBytes32(string memory source) public pure returns (bytes32){
            bytes32 ret;
    
            assembly {
                ret := mload(add(source, 32))
            }
    
            return ret;
        }
    ```

* 动态长度数组, 使用```bytes```声明， 可使用push, pop方法。
  
  ```solidity
  bytes public bytesArrayStorage;
  
  function ....(){
      bytes1 a = 0xb5; 
      bytesArrayStorage.push(a);
  ```
  
  可通过索引index修改数组内容
  
  ```solidity
  bytes memory byteArray;
  byteArray[1] = 0x01;
  ```
- 字节数组的合并
  
  使用bytes.contact方法，返回值是bytes类型。
  
  ```solidity
  function contactBytes() public pure returns (bytes memory, bytes memory){
  
          bytes memory a = abi.encodePacked("A");
          bytes memory b = "BC";
  
          bytes1 c = 0x12;
          bytes2 d = 0x628a;
  
          bytes memory e =  bytes.concat(a,b); // 0x414243
          bytes memory f =  bytes.concat(c,d); // 0x12628a
  
          return (e,f);
      }
  ```

### bytes和address转换

可以直接将``bytes20``强转换成address类型，需要注意的是这个操作比较浪费gas，因为转换后的地址是一个checksum的地址。

```solidity
function bytesToAddress(bytes20 input) public returns (address) {
    my_address = address(input);
    return my_address;
}
```

### 其他

在solidity 0.8版本之前，```byte``` 是 ```bytes1```的别名，byte[]容易让人产生误解，实际上他是一个byte1的数组，每一个element都会浪费31个byte。0.8之后，移除了这个keyword。[Solidity v0.8.0 Breaking Changes &mdash; Solidity 0.8.15 documentation](https://docs.soliditylang.org/en/v0.8.15/080-breaking-changes.html))

> The type `byte` has been removed. It was an alias of `bytes1`.

然而solidity的官方文档直到[0.8.7 版本](https://docs.soliditylang.org/en/v0.8.7/)才删除了这段描述。

> The type `byte[]` is an array of bytes, but due to padding rules, it wastes 31 bytes of space for each element (except in storage). It is better to use the `bytes` type instead.
