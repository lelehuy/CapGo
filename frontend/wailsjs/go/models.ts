export namespace main {
	
	export class StampInfo {
	    image: string;
	    x: number;
	    y: number;
	    width: number;
	    height: number;
	    pageNum: number;
	
	    static createFrom(source: any = {}) {
	        return new StampInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.image = source["image"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.pageNum = source["pageNum"];
	    }
	}

}

