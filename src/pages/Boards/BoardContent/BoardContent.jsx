import Box from '@mui/system/Box'
import ListColumns from './ListColumns/ListColumns'
import { mapOrder } from '~/utils/sorts'

import {
  DndContext,
  //PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  closestCorners,
  //closestCenter,
  pointerWithin,
  //rectIntersection,
  getFirstCollision
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useEffect, useState, useCallback, useRef } from 'react'
import { cloneDeep, isEmpty } from 'lodash'
import { generatePlaceholderCard } from '~/utils/formaster'

import Column from './ListColumns/Column/Column'
import Card from './ListColumns/Column/ListCards/Card/Card'

const ACTIVE_DRAG_ITEM_TYPE = {
  COLUMN: 'ACTIVE_DRAG_ITEM_COLUMN',
  CARD: 'ACTIVE_DRAG_ITEM_CARD'
}

function BoardContent({ board }) {
  //https://docs.dndkit.com/api-documentation/sensors
  //nếu dùng PointerSensor mặc định thì phải kết hợp thuộc tính CSS touch-action: none ở những phần tử kéo thả nhưng vẫn còn bug
  //const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } })

  // yêu cầu chuột di chuyển 10px rồi mới kích hoạt event, fix trường hợp click bị gọi event
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 10 } })
  // nhấn giữ 250ms và dung sai của cảm ứng (dễ hiểu là độ lướn của vật chạm vào màn hình 500px) thì mới kích hoạt event
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 500 } })

  //ưu tiên dùng cả mouse lẫn touch trong sensor để có trải nghiệm trên mobile là tốt nhất
  //const sensors = useSensors(pointerSensor)
  const sensors = useSensors(mouseSensor, touchSensor)

  const [orderedColumns, setOrderedColumns] = useState([])
  //cùng 1 thời điểm chỉ có 1 phần tử đang được kéo (column hoặc card)
  const [activeDragItemId, setActiveDragItemId] = useState([null])
  const [activeDragItemType, setActiveDragItemType] = useState([null])
  const [activeDragItemData, setActiveDragItemData] = useState([null])
  const [oldColumnWhenDraggingCard, setOldColumnWhenDraggingCard] = useState([null])

  // điểm va chạm cuối cùng trước đó (xử lý thuật toán phát hiện va chạm (p37))
  const lastOverId = useRef(null)

  useEffect(() => {
    setOrderedColumns(mapOrder(board?.columns, board?.columnOrderIds, '_id'))
  }, [board])

  // tìm một cái column theo CardId
  const findColumnByCardId = (cardId) => {
    // lưu ý nên dùng c.cards thay  vì c.cardOrderIds bởi vì ở bước handleDragOver chúng ta sẽ
    //làm dữ liệu cho cards hoàn chỉnh trước rồi mới tạo ra cardOrderIds mới
    return orderedColumns.find(column => column?.cards?.map(card => card._id)?.includes(cardId))
  }

  // cập nhật lại state
  const moveCardBetweenDiffrentColumns = (
    overColumn, overCardId, over, active, activeColumn, activeDraggingCardId, activeDraggingCardData
  ) => {
    setOrderedColumns(prevColumns => {
      //tìm vị trí (index) của cái over card trong column đích (nơi mà active card sắp được thả)
      const overCardIndex = overColumn?.cards?.findIndex(card => card._id === overCardId)

      // logic tính toán "cardIndex mới " (trên hoặc dưới của overcard) lấy chuẩn ra từ code cảu thư viện
      let newCardIndex
      const isBelowOverItem = active.rect.current.translated &&
        active.rect.current.translated.top > over.rect.top + over.rect.height

      const modifier = isBelowOverItem ? 1 : 0

      newCardIndex = overCardIndex >= 0 ? overCardIndex + modifier : overColumn?.cards?.length + 1

      //clone mảng OderedColumnsState cũ ra một cái mới để xử lí data rồi return --cập nhật lại OderedColumnsState mới
      const nextColumns = cloneDeep(prevColumns)
      const nextActiveColumn = nextColumns.find(column => column._id === activeColumn._id)
      const nextOverColumn = nextColumns.find(column => column._id === overColumn._id)

      //column cũ
      if (nextActiveColumn) {
        // Xóa card ở cái column active (cũng có thể hiểu là column cũ, lúc mà kéo card ra khỏi nó để sang column khác)

        nextActiveColumn.cards = nextActiveColumn.cards.filter(card => card._id !== activeDraggingCardId)

        //thêm placeholderCard Card nếu column rỗng: bị kéo hết card đi, không còn cái nào nữa(p37.2)
        if (isEmpty(nextActiveColumn.cards)) {
          nextActiveColumn.cards = [generatePlaceholderCard(nextActiveColumn)]
        }
        // cập nhật lại dữ liệu của mảng cardOderIds
        nextActiveColumn.cardOrderIds = nextActiveColumn.cards.map(card => card._id)
      }
      //column mới
      if (nextOverColumn) {
        //kiểm tra xem card đang kéo có trong overcolumn chưa nếu có thì cần xóa nó trc
        nextOverColumn.cards = nextOverColumn.cards.filter(card => card._id !== activeDraggingCardId)

        //phải cập nhật lại chuẩn dữ liệu columnId trong card sau khi kéo card giữa 2 column khác nhau
        const rebuild_activeDraggingCardData = {
          ...activeDraggingCardData,
          columnId: nextOverColumn._id
        }

        //thêm card đang kéo vào overcolumn theo vị trí index mới
        nextOverColumn.cards = nextOverColumn.cards.toSpliced(newCardIndex, 0, rebuild_activeDraggingCardData)

        //xóa placeholder Card đi nếu nó đang tồn tại (p37.2)
        nextOverColumn.cards = nextOverColumn.cards.filter(card => !card.FE_PlaceholderCard)

        //cập nhật lại dữ liệu của mảng cardOderIds
        nextOverColumn.cardOrderIds = nextOverColumn.cards.map(card => card._id)

      }


      return nextColumns
    })
  }

  // Trigger khi bắt đầu kéo 1 phần tử
  const handleDragStart = (event) => {
    //console.log('handleDragStart: ', event)
    setActiveDragItemId(event?.active?.id)
    setActiveDragItemType(event?.active?.data?.current?.columnId ? ACTIVE_DRAG_ITEM_TYPE.CARD : ACTIVE_DRAG_ITEM_TYPE.COLUMN)
    setActiveDragItemData(event?.active?.data?.current)

    //nếu khéo thả card thì mới thực hiện những hành động set giá trị oldColumn
    if (event?.active?.data?.current?.columnId) {
      setOldColumnWhenDraggingCard(findColumnByCardId(event?.active?.id))
    }
  }
  //Trigger khi trong quá trình kéo (drag) một phần tử
  const handleDragOver = (event) => {
    //console.log('handleDragOver: ', event)
    // không làm gì thêm nếu kéo collumn
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) return

    // nếu kéo card thì xử lý thêm để có thể kéo thả card qua lại giữa các columns
    const { active, over } = event

    //đảm bảo nếu không tồn tại active hoặc over (khi kéo thả khỏi phạm vi container) thị không làm gì tránh crash trang
    if (!active || !over) return
    //activeDraggingCardId là card đang được kéo
    const { id: activeDraggingCardId, data: { current: activeDraggingCardData } } = active
    // overCardId là card đang được tương tác trên hoặc dưới so với cái card được kéo ở trên.
    const { id: overCardId } = over

    //tìm hai cái columns theo cardId
    const activeColumn = findColumnByCardId(activeDraggingCardId)
    const overColumn = findColumnByCardId(overCardId)

    if (!activeColumn || !overColumn) return

    //xử lý logic ở đây chỉ khi kéo card qua 2 cloumn khác nhau, còn nếu kéo card trong chính column ban đầu
    // của nó thì không làm gì
    //vì đây đang là  đoạn xử lý lúc kéo (handleDragOver), còn xử lý lúc kéo xong xuôi thì nó lại là vấn đề khác ở (handleDragEnd)
    if (activeColumn._id !== overColumn._id) {
      moveCardBetweenDiffrentColumns(overColumn, overCardId, over, active, activeColumn, activeDraggingCardId, activeDraggingCardData)
    }
  }

  //Trigger khi kết thúc hành động kéo (drag) một phần tử => hành động thả(drop)
  const handleDragEnd = (event) => {
    //console.log('handleDragEnd: ', event)

    const { active, over } = event

    //kiểm tra nếu không tồn tại điểm over (kéo linh tinh ra ngoài thì k thực hiện code bên dưới)
    if (!active || !over) return

    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.CARD) {
      //activeDraggingCardId là card đang được kéo
      const { id: activeDraggingCardId, data: { current: activeDraggingCardData } } = active
      // overCardId là card đang được tương tác trên hoặc dưới so với cái card được kéo ở trên.
      const { id: overCardId } = over

      //tìm hai cái columns theo cardId
      const activeColumn = findColumnByCardId(activeDraggingCardId)
      const overColumn = findColumnByCardId(overCardId)

      if (!activeColumn || !overColumn) return

      //hành động kéo thả card giữa hai column khác nhau
      //phải dùng tới activeDragItemData.columnId hoặc oldColumnWhenDraggingCard._id (set vào state từ bước handleDragStart) chứ không phải activeData
      //trong scope handleDragEnd này vì sau khi đi qua onDragOver tới đây là State của Card đã bị cập nhật một lần rồi
      if (oldColumnWhenDraggingCard._id !== overColumn._id) {
        moveCardBetweenDiffrentColumns(overColumn, overCardId, over, active, activeColumn, activeDraggingCardId, activeDraggingCardData)
      } else {
        //Hành động kéo thả trong cùng 1 column

        // lấy vị trí cũ (từ thằng oldColumnWhenDraggingCard)
        const oldCardIndex = oldColumnWhenDraggingCard?.cards?.findIndex(c => c._id === activeDragItemId)
        // lấy vị trí mới (từ thằng oldColumnWhenDraggingCard)
        const newCardIndex = overColumn?.cards?.findIndex(c => c._id === overCardId)
        // dùng arrayMove vì kéo card trong một cái column thì tương tự với logic kéo column trong một cái board content
        const dndOrderedCards = arrayMove(oldColumnWhenDraggingCard?.cards, oldCardIndex, newCardIndex)
        setOrderedColumns(prevColumns => {
          //clone mảng OderedColumnsState cũ ra một cái mới để xử lí data rồi return --cập nhật lại OderedColumnsState mới
          const nextColumns = cloneDeep(prevColumns)

          //tìm tới column đang thả
          const targetColumn = nextColumns.find(column => column._id === overColumn._id)

          //cập nhật lại hai giá trị mới là card và cardOrderIds trong cái targetColumn
          targetColumn.cards = dndOrderedCards
          targetColumn.cardOrderIds = dndOrderedCards.map(card => card._id)

          //trả về state mới chuẩn vị trí
          return nextColumns
        })
      }

    }
    //xử lý kéo thả columns trong 1 board content
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) {
      if (active.id !== over.id) {
        // lấy vị trí cũ (từ thằng active)
        const oldColumnIndex = orderedColumns.findIndex(c => c._id === active.id)
        // lấy vị trí mới (từ thằng active)
        const newColumnIndex = orderedColumns.findIndex(c => c._id === over.id)

        //dùng arrayMove của thằng dnd-Kit để sắp xếp lại mảng Column ban đầu
        // Code của arayMove ở đây : dnd-kit/packages/sortable/src/utilities/arrayMove.ts
        const dndOrderedColumns = arrayMove(orderedColumns, oldColumnIndex, newColumnIndex)
        // 2 console.log dung để sau này xử lý gọi API
        //const dndOrderedColumnsIds = dndOrderedColumns.map(c => c._id)
        //console.log('dndOrderedColumns: ', dndOrderedColumns)
        //console.log('dndOrderedColumnsIds: ', dndOrderedColumnsIds)

        //cập nhật lại columns sau khi đã kéo thả
        setOrderedColumns(dndOrderedColumns)
      }

    }

    //nếu vị trí sau khi kéo khác vị trí ban đầu

    //những dữ liệu sau khi kéo thả luôn phải đưa về null
    setActiveDragItemId(null)
    setActiveDragItemType(null)
    setActiveDragItemData(null)
    setOldColumnWhenDraggingCard(null)
  }

  const customDropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } })
  }

  // custom lại chiến lược/ thuật toán phát hiện va chạm tối ưu cho việc kéo thả card giữa nhiều columns (p37)
  // args = arguments = Các Đối số, tham số
  const collisionDetectionStrategy = useCallback((args) => {
    // trường hợp kéo column thì đúng thuật toán cloestConner là chuẩn nhất
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) {
      return closestCorners({ ...args })
    }

    // tìm các điểm giao nhau, va chạm - interections với con trỏ
    const pointerIntersections = pointerWithin(args)

    // nếu pointerIntersections là mảng rỗng return luôn không làm gì hết
    //fix triệt để bug flickerring của thư biên dnd-kit trong trường hợp
    // kéo card có image cover lớn và kéo về phái trên cùng ra khỏi khu vực kéo thả
    if (!pointerIntersections?.length) return

    // thuật toán phát hiện va chạm sẽ trả về một mảng các va chạm ở đây (không cần bước này nữa)
    // const intersetions = !!pointerIntersections?.length
    //   ? pointerIntersections
    //   : rectIntersection(args)

    // tìm overId đầu tiên trong đám pointerIntersections ở trên
    let overId = getFirstCollision(pointerIntersections, 'id')
    if (overId) {
      //nếu cái over nó là column thì sẽ tìm tới cái cardId gần nhất bên trong khu vực va chạm đó dựa vào
      // thuật toán phát hiện va chạm closestCenter hoặc closestConners đều được
      const checkColumn = orderedColumns.find(column => column._id === overId)
      if (checkColumn) {
        overId = closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter(Container => {
            return (Container.id !== overId) && (checkColumn?.cardOrderIds?.includes(Container.id))
          })
        })[0]?.id
      }

      lastOverId.current = overId
      return [{ id: overId }]
    }
    //nếu over id là null thì trả về bằng mảng rỗng - tránh bug crash trang
    return lastOverId.current ? [{ id: lastOverId.current }] : []
  }, [activeDragItemType, orderedColumns])

  return (
    <DndContext
      //cảm biến (p30)
      sensors={sensors}
      //thuật toán phát hiện va chạm (nếu không có nó thì card với cover lớn sẽ không kéo qua column đc
      // vì nó đang bị conflict giữa card và column) => dùng closestCorners của dndKit
      //
      // dùng lệnh này sẽ có bug flickering +sai lệch dữ liệu (p37)
      //collisionDetection={closestCorners}

      //tự custom bằng thuật toán phát hiện và va chạm

      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box sx={{
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#34495e' : '#1976d2'),
        width: '100%',
        height: (theme) => theme.trello.boardContentHeight,
        p: '10px 0'

      }}>
        <ListColumns columns={orderedColumns} />
        <DragOverlay dropAnimation={customDropAnimation}>
          {(!activeDragItemType) && null}
          {(activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) && <Column column={activeDragItemData} />}
          {(activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.CARD) && <Card card={activeDragItemData} />}
        </DragOverlay>
      </Box>

    </DndContext>

  )
}

export default BoardContent
