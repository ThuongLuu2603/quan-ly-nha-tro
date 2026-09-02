import { useState } from 'react'

import { useDataset } from '../../data/store'

import { Card, EmptyState } from '../../ui/components'

import { Page } from '../../ui/Page'

import { RoomFormSheet } from './RoomFormSheet'

import { RoomSortableList } from './RoomSortableList'



export function RoomsPage() {

  const data = useDataset()

  const [adding, setAdding] = useState(false)



  const occupied = data.rooms.filter((r) =>

    data.tenancies.some((t) => t.roomId === r.id && t.status === 'active'),

  )



  return (

    <Page title="Phòng" subtitle={`${occupied.length}/${data.rooms.length} phòng đang có khách`}>

      {data.rooms.length === 0 ? (

        <EmptyState

          icon="rooms"

          text="Chưa có phòng nào. Thêm phòng đầu tiên để bắt đầu."

          action={

            <button className="btn primary" onClick={() => setAdding(true)}>

              Thêm phòng

            </button>

          }

        />

      ) : (

        <Card flush>

          <RoomSortableList data={data} />

        </Card>

      )}



      {data.rooms.length > 0 && (

        <button className="fab" onClick={() => setAdding(true)}>

          + Phòng

        </button>

      )}



      {adding && <RoomFormSheet settings={data.settings} onClose={() => setAdding(false)} />}

    </Page>

  )

}

