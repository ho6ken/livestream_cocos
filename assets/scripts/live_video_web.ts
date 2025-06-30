import { _decorator, Camera, Component, director, error, Node, screen, Size, UITransform, view, warn } from 'cc';
import Hls from 'hls.js';

const { ccclass, property } = _decorator;

/**
 * 
 * @summary 只支援web版本的非加密hls
 */
@ccclass
export class LiveVideoWeb extends Component {
    /**
     * 
     */
    private _video: HTMLVideoElement | null = null;

    /**
     * 
     */
    private _hls: Hls | null = null;

    /**
     * 
     */
    @property({ displayName: `影片url`, tooltip: `可為.m3u8串流` })
    private url: string = `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;

    /**
     * 
     */
    private _camera: Camera | null = null;

    /**
     * 
     */
    protected onLoad(): void {
        this._camera = director.getScene().getComponentInChildren(Camera) ?? null;

        // 創建video player
        this.createVideo();

        // 視窗發生變化時校正顯示位置
        screen.on('window-resize', this.adjustVideo, this);
    }

    /**
     * 
     */
    protected start(): void {
        this.adjustVideo();
        this.url && this.playVideo(this.url);
    }

    /**
     * 
     */
    protected onDestroy(): void {
        // hls
        if (Hls.isSupported()) {
            this._hls.off(Hls.Events.MANIFEST_PARSED, this.onParsed.bind(this));
            this._hls.off(Hls.Events.ERROR, this.onError.bind(this));
            this._hls.destroy();
        }
        // m3u8
        else if (this._video.canPlayType(`application/vnd.apple.mpegurl`)) {
            this._video.removeEventListener(`loadedmetadata`, this.onParsed.bind(this));
        }

        screen.off('window-resize', this.adjustVideo, this); 
    }

    /**
     * 創建video player
     */
    private createVideo(): void {
        this._video = document.createElement('video');
        this._video.style.position = 'absolute';
        this._video.style.pointerEvents = 'none';  // 避免擋住ui點擊
        this._video.style.zIndex = '999';
        this._video.style.backgroundColor = 'black';
        this._video.style.objectFit = 'cover';

        this._video.style.left = '0px';
        this._video.style.top = '0px';
        this._video.style.width = '100%';
        this._video.style.height = '100%';

        this._video.autoplay = true;
        this._video.muted = true;  // 手機瀏覽器要求自動播放需靜音
        this._video.controls = true;
        this._video.playsInline = true;

        document.body.appendChild(this._video);
    }

    /**
     * 校正video顯示位置
     */
    private adjustVideo(): void {
        if (!this._video || ! this._camera) {
            warn(`adjust video failed, video or camera is null.`);
            return;
        }

        let canvas = document.querySelector('canvas');

        if (!canvas) {
            warn(`adjust video failed, canvas is null.`);
            return;
        }

        let game = this.getGameSize(canvas);
        let design = view.getDesignResolutionSize();

        // 縮放倍率
        let scale = Math.max(
            game.width / design.width,
            game.height / design.height,
        );

        // 依照縮放取得新的物件大小
        let target = this.getComponent(UITransform);
        let width = target.width * scale;
        let height = target.height * scale;

        let client = canvas.getBoundingClientRect();
        let pos = this.node.getWorldPosition();

        // 依照縮放新的左位置
        let left = client.left;                   // 網頁顯示範圍
        left += (client.width - game.width) / 2;  // 遊戲顯示位置
        left += pos.x * scale - width / 2;        // 物件在遊戲內的位置

        // 依照縮放新的上位置
        let top = client.top;                      // 網頁顯示範圍
        top += (client.height - game.height) / 2;  // 遊戲顯示位置
        top += pos.y * scale - height / 2;         // 物件在遊戲內的位置

        // 重設
        let style = this._video.style;
        style.left = `${left}px`;
        style.top = `${top}px`;
        style.width = `${width}px`;
        style.height = `${height}px`;
    }

    /**
     * 取得遊戲經過變化後的真正大小
     */
    private getGameSize(canvas: any): Size {
        let client = canvas.getBoundingClientRect();
        let design = view.getDesignResolutionSize();

        // 縮放倍率
        let scale = Math.min(
            client.width / design.width,
            client.height / design.height,
        );

        return new Size(design.width * scale, design.height * scale);
    }

    /**
     * 播放video
     */
    private playVideo(url: string): void {
        this.url = url;

        if (!this._video) {
            error(`playe video failed, html video element is null.`, url);
            return;
        }

        // hls
        if (Hls.isSupported()) {
            this._hls = new Hls();
            this._hls.loadSource(url);
            this._hls.attachMedia(this._video);

            // event
            this._hls.on(Hls.Events.MANIFEST_PARSED, this.onParsed.bind(this));
            this._hls.on(Hls.Events.ERROR, this.onError.bind(this));
        }
        // m3u8
        else if (this._video.canPlayType(`application/vnd.apple.mpegurl`)) {
            this._video.src = url;
            this._video.addEventListener(`loadedmetadata`, this.onParsed.bind(this));
        }
        else {
            error(`play video failed, not support.`, url);
            return;
        }
    }

    /**
     * manifest解析完成
     */
    private onParsed(): void {
        this._video.play();
    }

    /**
     * 播放錯誤
     */
    private onError(event: any, data: any): void {
        switch (data.type) {
            // 自動重連
            case Hls.ErrorTypes.NETWORK_ERROR:
                this._hls?.startLoad();
                warn(`hls play failed, start reconnecting.`, this.url);
                break;

            // 嘗試修復
            case Hls.ErrorTypes.MEDIA_ERROR:
                this._hls?.recoverMediaError();
                warn(`hls play failed, try recover media err.`, this.url);
                break;

            // 無法修復
            default:
                this._hls?.destroy();
                error(`hls play video faild, close hls.`, this.url, data.type);
                break;
        }
    }
}
