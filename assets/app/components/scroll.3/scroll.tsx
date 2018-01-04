import * as React from "react"
import { Projector, Cache } from "./projector"
import { Item } from "./item"
// import { debounce } from "lodash"

export type Props<T= {}> = {
  cache?: Cache[],
  containerHeight: number
  itemAverageHeight: number
  className?: string
  items: T[]
  identity?: string
  initialScrollTop?: number
  onRenderCell: (item?: T, index?: number) => React.ReactNode
  onScroll?: (dom: HTMLDivElement) => void
  onEnd?: () => void
}

export type State = {
  projectedItems: any[]
  upperPlaceholderHeight: number
  underPlaceholderHeight: number
}

export class InfiniteScroll extends React.Component<Props, State> {
  public static defaultProps = {
    initialScrollTop: 0,
    onScroll: () => { },
    onEnd: () => { }
  }
  public state: State = { projectedItems: [], underPlaceholderHeight: 0, upperPlaceholderHeight: 0 }
  private divDom: HTMLDivElement
  private upperContentDom: HTMLDivElement
  private hasBottomTouched = true
  private scrollTop = 0
  private projector: Projector
  private width: number
  private resizing = false

  public componentWillReceiveProps(nextProps: Props) {
    this.hasBottomTouched = false
    this.projector.next(nextProps.items)
  }

  public componentDidUpdate() {
    this.adjustUpperPlaceholderHieght()
  }

  /**
   * 第一次加载空数组，为了拿到容器的dom：divDom
   */
  public componentDidMount() {
    this.width = this.divDom.clientWidth
    this.projector = new Projector(this.divDom, this.upperContentDom, this.props.items, this.props.itemAverageHeight, this.props.cache)
    this.projector.subscribe((projectedItems, upperPlaceholderHeight, underPlaceholderHeight) => {
      if (underPlaceholderHeight < this.divDom.clientHeight && !this.hasBottomTouched) {
        this.hasBottomTouched = true
        this.props.onEnd!()
      }
      const prevStateItemsLength = this.state.projectedItems.length
      this.setState({ projectedItems, upperPlaceholderHeight, underPlaceholderHeight }, () => {
        if (prevStateItemsLength === 0 && projectedItems.length > 0) {
          this.divDom.scrollTop = this.props.initialScrollTop!
        }
      })
    })

    // this.down = debounce(this.projector.down, 100)
    // this.up = debounce(this.projector.up, 50)

    // 如果初始化的时候 items 不是空数组，则要通知投影仪渲染。异步的情况下，receiveProps 通知投影仪渲染
    if (this.props.items.length > 0) {
      this.hasBottomTouched = false
      this.projector.next()
    }

    window.addEventListener("resize", () => {
      if (this.divDom.clientWidth !== this.width) {
        this.width = this.divDom.clientWidth
        this.resizing = true
        this.projector.cachedItemRect.length = 0
        this.projector.needAdjustment = true
        this.setState({})
      }
    })
  }

  public render() {
    return (
      <div id="c" ref={div => this.divDom = div!} style={{ overflow: "scroll", boxSizing: "border-box", height: this.props.containerHeight }} onScroll={this.onScroll}>
        <div ref={div => this.upperContentDom = div!} style={{ height: this.state.upperPlaceholderHeight }}></div>
        {this.state.projectedItems.map((item, index) =>
          <Item
            key={this.props.identity ? item[this.props.identity] : index}
            projector={this.projector}
            item={item}
            itemIndex={this.projector.startIndex + index}
            upperPlaceholderHeight={this.state.upperPlaceholderHeight}
            onRenderCell={this.props.onRenderCell}
            isLast={index === this.state.projectedItems.length - 1}
          />
        )}
        <div style={{ height: this.state.underPlaceholderHeight }}></div>
      </div>
    )
  }

  /**
   * 纠正缓冲区
   * 如果上方填充高度是猜测得来的，那加载之后的新的item是的top也是基于猜测得来的。
   * 如何知道上方是猜测得来的，可以看 needAdjust 是否为 true。
   * 第一次 next，填充高度不变，告诉之后需要调整。
   * 第一次 render，子节点发现需要调整，刷新自己的缓存。
   * 第一次 didupdate，发现需要调整，根据之前的高度减去滑过的item的高度(这些高度就是刚缓存进去的)
   * 第二次 render，子节点发现还是需要调整，根据刚刚拿到的正确的填充高度再刷新一次缓存。最后一个子节点把 needAdjustment 改成 false。
   * 第二次didupdate，不需要调整
   */
  public adjustUpperPlaceholderHieght() {
    if (this.projector.needAdjustment) {
      if (this.projector.isAdjusting) {
        this.projector.needAdjustment = false
        this.projector.isAdjusting = false
        return
      }
      const cachedItemRect = this.projector.cachedItemRect
      const anchor = this.projector.anchorItem
      const cachedAnchorItem = cachedItemRect[anchor.index]
      const startItem = this.projector.cachedItemRect[this.projector.startIndex]
      const finalHeight = this.projector.computeUpperPlaceholderHeight(cachedAnchorItem, startItem.top)
      const scrollTop = this.divDom.scrollTop
      const upperPlaceholderHeight = startItem.index === 0 ? 0 : finalHeight < 0 ? 0 : finalHeight

      this.setState({ upperPlaceholderHeight }, () => {
        if (startItem.index > 0) {
          if (finalHeight < 0) this.divDom.scrollTop = scrollTop - finalHeight
          if (this.resizing) {
            const currentAnchor = this.projector.cachedItemRect[this.projector.startIndex + 3]
            const anchorDelta = anchor.offset - currentAnchor.top
            const nextScrollTop = this.divDom.scrollTop - anchorDelta

            // 让滚动位置保持在描点中
            if (nextScrollTop < currentAnchor.top) {
              this.divDom.scrollTop = currentAnchor.top
            } else if (nextScrollTop > currentAnchor.bottom) {
              this.divDom.scrollTop = currentAnchor.bottom
            } else {
              this.divDom.scrollTop = nextScrollTop
            }

            this.resizing = false
          }
        } else {
          this.divDom.scrollTop = scrollTop - finalHeight
        }

        // this.projector.anchorItem = { index: this.projector.startIndex + 3, offset: this.projector.cachedItemRect[this.projector.startIndex + 3].top }
      })
    }
    this.projector.anchorItem = { index: this.projector.startIndex + 3, offset: this.projector.cachedItemRect[this.projector.startIndex + 3].top }

    // if (this.projector.needAdjustAnchor) {
    //   this.projector.adjustAnchor()
    //   this.projector.needAdjustAnchor = false
    // }
    console.log(this.projector.anchorItem)
  }

  public onScroll = () => {
    const newScrollTop = this.divDom.scrollTop
    this.props.onScroll!(this.divDom)
    if (newScrollTop < this.scrollTop) {
      // 手往下滑,屏幕往上滑
      this.projector.down()
    } else {
      // 往上滑,屏幕往下滑
      this.projector.up()
    }
    this.scrollTop = newScrollTop
  }
}
