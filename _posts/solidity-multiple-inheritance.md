---
title: solidity中的多重继承
date: 2022-07-30 20:17:00
tags: solidity, inheritance
---




写合约的过程中，经常遇到继承多个合约，需要override的情况。比如openzeppelin的

ERC1155，AccessControl都实现了``supportsInterface``函数，如果你的合约同时继承这两个合约，需要重写此函数。



定义2个基类`BaseContact1`和 ```BaseContact2```, 使用`virtual`关键字。

```
contract BaseContact1 {

    function getColor() virtual public view returns(string memory color) {
        return "red";
    }

    function makeColor() virtual public pure {
        
    }
}
```

实现`ImplContract`继承自上面两个基类，此时如果不override virtual函数，编译会提示以下错误。

> Derived contract must override function "supportsInterface". 
> Two or more base classes define function with same name and parameter types.



使用override关键字，重写两个virtual函数， 重写后的函数也可以继续用virtual修饰，给子类提供重写的可能。

```
override(BaseContact1, BaseContact2)
```



完整代码如下

```
pragma solidity ^0.8.0;

contract BaseContact1 {

    function getColor() virtual public view returns(string memory color) {
        return "red";
    }

    function makeColor() virtual public pure {
        
    }
}

contract BaseContact2 {
 
    function getColor() virtual public view returns(string memory color) {
        return "yellow";
    }

    function makeColor() virtual public pure {
        
    }
}

contract ImplContract is BaseContact1, BaseContact2 {

    // override only
    function getColor() public override(BaseContact1, BaseContact2) view returns(string memory color){
        // mix colors
        return string(abi.encodePacked(BaseContact2.getColor(), "&" ,BaseContact1.getColor()));
    }

    // override + virtual，child 可以继续override
    function makeColor() public virtual override(BaseContact1, BaseContact2) pure {

    }
}
```
