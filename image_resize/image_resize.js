'use strict';

var im = require('imagemagick');
var fs = require('fs');
var aws = require('aws-sdk');
var s3 = new aws.S3({ apiVersion: '2006-03-01' });

// 最後に呼ばれる
var postProcessResource = function(resource, fn) {
    var ret = null;
    if (resource) {
        if (fn) {
            ret = fn(resource);
        }
        try {
            fs.unlinkSync(resource);
        } catch (err) {
            // Ignore
        }
    }
    return ret;
};


var resizeImage = function(event, context) {

    // 縮小サイズ決定
    event.width = 200;

    event.srcData = new Buffer(event.base64Image, 'base64');
    delete event.base64Image;
    // Lambdaファンクションの動作環境での作業場所
    event.dstPath = '/tmp/resized.';

    try {
        im.resize(event, function(err, stdout, stderr) {
            if (err) {
                throw err;
            } else {
                console.log('Resize operation completed successfully');

                var params = {
                    Bucket: event.bucket,
                    Key: event.outPutName,
                    Body: new Buffer(fs.readFileSync(event.dstPath)),
                    ContentType: 'image/jpeg'
                };

                // S3にputする
                s3.putObject(params, function(err, data){
                    console.log(err);
                    console.log(data);
                    // putが終わったら成功としてLambdaファンクションを閉じる
                    context.succeed(postProcessResource(event.dstPath, function(file) {}));
                });
            }
        });
    } catch (err) {
        console.log('Resize operation failed:', err);
        context.fail(err);
    }
};


// 最初に呼ばれる関数
exports.handler = function(event, context) {

    // S3から渡ってくるバケットの名前の取得
    event.bucket = event.Records[0].s3.bucket.name;

    // 画像ファイル名取得
    var key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    var params = {
        Bucket: event.bucket,
        Key: key
    };

    var reg = /(.*)(?:\.([^.]+$))/;
    var match =  key.match(reg);

    console.log(match[1]);

    // _thumのついているファイルは処理しない(処理するとS3に無限にアップロードされる)
    if(match[1].lastIndexOf('_thum') != -1){
        console.log("skip");
        return;
    }
    // 変換後のファイル名
    event.outPutName = match[1]+'_thum.'+ match[2];

    // S3のファイルを取得
    s3.getObject(params, function(err, data) {
        event.base64Image = new Buffer(data.Body).toString('base64');
        resizeImage(event, context);
    })
};